'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
    Plus, X, LogOut, Briefcase, Settings, Edit2, 
    Trash2, Archive, RotateCcw, AlertTriangle,
    User as UserIcon, Eye, EyeOff, Moon, HelpCircle, 
    BookOpen, Users, Home, Camera,
    CreditCard, Loader2, Sparkles, Building2
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui/button';
import { auth, db, storage } from '@/lib/firebase';
import { signOut, updateProfile } from 'firebase/auth';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { provisionEntityMold } from '@/lib/mold/entityMold';
import {
    claimEntitySlug,
    generateUniqueEntitySlug,
    getEntityRouteSegment,
    releaseEntitySlug,
    slugifyEntityName,
    validateEntitySlug,
    findGhostEntities,
    filterRealEntities,
} from '@/lib/entitySlug';
import { AskRooseveltBar } from '@/components/floating-bars/AskRooseveltBar';
import { LeftFloatingBar } from '@/components/floating-bars/LeftFloatingBar';
import { RightFloatingBar } from '@/components/floating-bars/RightFloatingBar';


interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
}

const BlueParticles = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationFrame = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const particleCount = 450;
    particles.current = Array.from({ length: particleCount }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 1.5 + 0.5,
      seed: Math.random()
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current.forEach((p) => {
        p.x += p.vx + Math.sin(Date.now() * 0.001 + p.seed * 10) * 0.2;
        p.y += p.vy + Math.cos(Date.now() * 0.001 + p.seed * 10) * 0.2;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const opacity = 0.1 + p.seed * 0.3;
        ctx.fillStyle = `rgba(59, 130, 246, ${opacity})`;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrame.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[1] pointer-events-none"
    />
  );
};

interface Entity {
    id: string;
    name?: string;
    slug?: string;
    description?: string;
    type?: string;
    status?: 'active' | 'archived';
    photoURL?: string;
    logoUrl?: string;
}

const DEFAULT_DEMO_ENTITIES: Entity[] = [
    {
        id: 'personal',
        name: 'Personal',
        slug: 'personal',
        description: 'Bandeja omnicanal, difusiones y chatbots automatizados',
        type: 'persona',
        status: 'active',
    }
];

export default function NucleoPage() {
    const router = useRouter();
    const { currentUser, loading, setActiveEntity } = useAuth();
    const { t } = useLanguage();
    const [mounted, setMounted] = useState(false);
    const [transitioning, setTransitioning] = useState<string | null>(null);

    const [entities, setEntities] = useState<Entity[]>([]);
    const [managementMode, setManagementMode] = useState(false);

    // Modals States
    const [isCreating, setIsCreating] = useState(false);
    const [editEntity, setEditEntity] = useState<Entity | null>(null);
    const [deleteEntity, setDeleteEntity] = useState<Entity | null>(null);
    const [archiveEntity, setArchiveEntity] = useState<Entity | null>(null);

    const [inputValue, setInputValue] = useState('');
    const [slugValue, setSlugValue] = useState('');
    const [slugError, setSlugError] = useState('');
    const [creationCategory, setCreationCategory] = useState<'persona' | 'profesional'>('profesional');
    const [professionalSubtype, setProfessionalSubtype] = useState<'creador' | 'empresa'>('empresa');
    const [creatingProgress, setCreatingProgress] = useState(false);

    // Photo Edit State
    const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
    const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [userDocPhoto, setUserDocPhoto] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setMounted(true);
        if (!loading && !currentUser) {
            router.push('/login');
        }
    }, [currentUser, loading, router]);

    // Escuchar documento del usuario en Firestore para fotos actualizadas en tiempo real (omitido en demo)
    useEffect(() => {
        if (!currentUser || currentUser.uid.startsWith('demo')) return;
        try {
            const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setUserDocPhoto(data.photoURL || data.avatarUrl || null);
                }
            }, () => {});
            return () => unsub();
        } catch {}
    }, [currentUser]);

    useEffect(() => {
        if (currentUser) {
            const loadLocalFallback = () => {
                try {
                    const stored = localStorage.getItem('elizmey_demo_entities');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setEntities(parsed);
                            return;
                        }
                    }
                } catch {}
                setEntities(DEFAULT_DEMO_ENTITIES);
            };

            if (currentUser.uid.startsWith('demo')) {
                loadLocalFallback();
                return;
            }

            // Timeout de seguridad: si Firestore tarda o no está inicializado, no congelar la pantalla
            const safetyTimeout = setTimeout(() => {
                setEntities((prev) => prev.length > 0 ? prev : DEFAULT_DEMO_ENTITIES);
            }, 1200);

            const q = collection(db, `users/${currentUser.uid}/entities`);
            const unsubscribe = onSnapshot(q, (snapshot) => {
                clearTimeout(safetyTimeout);
                const ents = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Entity));
                setEntities(ents.length > 0 ? ents : DEFAULT_DEMO_ENTITIES);
            }, (error) => {
                clearTimeout(safetyTimeout);
                console.warn("Could not load entities from Firestore (handled):", error);
                loadLocalFallback();
            });
            return () => {
                clearTimeout(safetyTimeout);
                unsubscribe();
            };
        }
    }, [currentUser]);

    // Resuelve de forma robusta la foto de la entidad o perfil personal
    const resolveEntityPhoto = (entity: Entity) => {
        if (entity.photoURL) return entity.photoURL;
        if (entity.logoUrl) return entity.logoUrl;
        if (entity.type === 'persona') {
            return userDocPhoto || currentUser?.photoURL || '';
        }
        return '';
    };

    if (!mounted || loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white/50 tracking-widest text-sm">Loading...</div>;
    if (!currentUser) return null;

    const ghostEntities = findGhostEntities(entities);
    const ghostIds = new Set(ghostEntities.map((e) => e.id));
    const realEntities = filterRealEntities(entities).filter((e) => e.status !== 'archived');
    // Filtro estricto: en esta plataforma SOLO se muestran entornos de tipo personal
    const listedEntities = (managementMode ? entities : realEntities).filter(
        (e) => e.type === 'persona'
    );

    const entityTypeLabel = (entity: Entity) => {
        if (entity.status === 'archived') return 'Archived';
        return 'Personal';
    };

    const handleLogout = async () => {
        await signOut(auth);
        router.push('/login');
    };

    const handleSelectEntity = async (entity: Entity) => {
        if (managementMode) return;
        setTransitioning(entity.id);

        const route = getEntityRouteSegment(entity);
        setActiveEntity(entity.id, route);
        localStorage.setItem('elizmey_active_entity', entity.id);
        localStorage.setItem('elizmey_active_entity_route', route);

        // El entorno personal es el único gratuito y no requiere suscripción
        if (entity.type === 'persona') {
            setTimeout(() => {
                router.push(`/home/${route}`);
            }, 400);
            return;
        }

        // Entornos empresariales: se entra siempre a su órbita. Sin plan vigente (suscripción o código de acceso)
        // todas las suites aparecen con candado y llevan a canjear un código o pagar.
        setTimeout(() => {
            router.push(`/home/${route}`);
        }, 400);
    };

    // --- CRUD Handlers ---

    const handleCreateEntity = async () => {
        if (!currentUser || !inputValue.trim()) return;
        setCreatingProgress(true);

        const finalType = 'persona';
        const randomId = `bs_${Math.random().toString(36).substring(2, 9)}`;
        const baseSlug = slugifyEntityName(inputValue) || randomId;

        const newEntity: Entity = {
            id: randomId,
            name: inputValue.trim(),
            slug: baseSlug,
            status: 'active',
            type: finalType,
        };

        if (currentUser.uid.startsWith('demo')) {
            setEntities((prev) => {
                const updated = [...prev, newEntity];
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success('Entorno personal creado con éxito');
            setIsCreating(false);
            setInputValue('');
            setCreatingProgress(false);
            return;
        }

        try {
            const entityRef = doc(db, `users/${currentUser.uid}/entities/${randomId}`);
            let uniqueSlug = baseSlug;
            try {
                uniqueSlug = await generateUniqueEntitySlug(currentUser.uid, inputValue, randomId);
            } catch (slugErr) {
                console.warn("Could not generate unique slug via firestore:", slugErr);
            }

            await setDoc(entityRef, {
                initialized: true,
                name: inputValue.trim(),
                slug: uniqueSlug,
                status: 'active',
                type: finalType,
                createdAt: new Date()
            });

            try {
                await claimEntitySlug(currentUser.uid, randomId, uniqueSlug);
            } catch (claimErr) {
                console.warn("Could not claim slug:", claimErr);
            }

            try {
                await setDoc(doc(db, `users/${currentUser.uid}/entities/${randomId}/settings/general`), {
                    theme: 'dark',
                    branding: inputValue.trim()
                });
            } catch (setErr) {
                console.warn("Could not save general settings:", setErr);
            }

            try {
                await provisionEntityMold(db, currentUser.uid, randomId);
            } catch (moldErr) {
                console.warn("Could not provision mold:", moldErr);
            }

            toast.success('Entorno creado con éxito');
            setIsCreating(false);
            setInputValue('');
            setCreationCategory('profesional');
            setProfessionalSubtype('empresa');
        } catch (error: any) {
            console.warn("Firestore entity creation error, falling back locally:", error);
            setEntities((prev) => {
                const updated = [...prev, newEntity];
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success('Entorno creado con éxito');
            setIsCreating(false);
            setInputValue('');
            setCreationCategory('profesional');
            setProfessionalSubtype('empresa');
        } finally {
            setCreatingProgress(false);
        }
    };

    const handleCloseEdit = () => {
        setEditEntity(null);
        setSlugError('');
        setInputValue('');
        setSlugValue('');
        setEditPhotoFile(null);
        setEditPhotoPreview(null);
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must not exceed 5MB');
            return;
        }
        setEditPhotoFile(file);
        setEditPhotoPreview(URL.createObjectURL(file));
    };

    const handleUpdateEntity = async () => {
        if (!editEntity || !inputValue.trim() || !currentUser) return;

        const validation = validateEntitySlug(slugValue);
        if (!validation.valid) {
            setSlugError(validation.error || 'Invalid route slug.');
            return;
        }

        setSavingEdit(true);

        if (currentUser.uid.startsWith('demo')) {
            setEntities((prev) => {
                const updated = prev.map((e) => e.id === editEntity.id ? {
                    ...e,
                    name: inputValue.trim(),
                    slug: slugValue.trim().toLowerCase(),
                } : e);
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success('Environment updated successfully');
            handleCloseEdit();
            setSavingEdit(false);
            return;
        }

        try {
            const ref = doc(db, `users/${currentUser.uid}/entities/${editEntity.id}`);
            try {
                await claimEntitySlug(currentUser.uid, editEntity.id, slugValue, editEntity.slug);
            } catch (err) {
                console.warn("Could not claim slug:", err);
            }

            let photoDownloadUrl = editEntity.photoURL || editEntity.logoUrl || '';

            if (editPhotoFile) {
                try {
                    const imgRef = storageRef(storage, `users/${currentUser.uid}/entities/${editEntity.id}/avatar_${Date.now()}`);
                    await uploadBytes(imgRef, editPhotoFile);
                    photoDownloadUrl = await getDownloadURL(imgRef);

                    // If personal entity, sync auth profile and user doc
                    if (editEntity.type === 'persona') {
                        try {
                            await updateProfile(currentUser, { photoURL: photoDownloadUrl });
                            await updateDoc(doc(db, `users/${currentUser.uid}`), { photoURL: photoDownloadUrl });
                        } catch (err) {
                            console.warn("Could not sync auth profile:", err);
                        }
                    }
                } catch (imgErr) {
                    console.warn("Could not upload image:", imgErr);
                }
            }

            const updatePayload: Record<string, any> = {
                name: inputValue.trim(),
                slug: slugValue.trim().toLowerCase(),
            };

            if (photoDownloadUrl) {
                updatePayload.photoURL = photoDownloadUrl;
                updatePayload.logoUrl = photoDownloadUrl;
            }

            await updateDoc(ref, updatePayload);

            toast.success('Environment updated successfully');
            handleCloseEdit();
        } catch (error) {
            console.warn("Error saving entity changes to Firestore, fallback local:", error);
            setEntities((prev) => {
                const updated = prev.map((e) => e.id === editEntity.id ? {
                    ...e,
                    name: inputValue.trim(),
                    slug: slugValue.trim().toLowerCase(),
                } : e);
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success('Environment updated successfully');
            handleCloseEdit();
        } finally {
            setSavingEdit(false);
        }
    };

    const handleToggleArchive = async (entity: Entity) => {
        if (!currentUser) return;
        const newStatus: 'active' | 'archived' = entity.status === 'archived' ? 'active' : 'archived';

        if (currentUser.uid.startsWith('demo')) {
            setEntities((prev) => {
                const updated = prev.map((e) => e.id === entity.id ? { ...e, status: newStatus } : e);
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success(newStatus === 'archived' ? 'Environment archived successfully' : 'Environment restored successfully');
            setArchiveEntity(null);
            return;
        }

        try {
            const ref = doc(db, `users/${currentUser.uid}/entities/${entity.id}`);
            await updateDoc(ref, { status: newStatus });
            toast.success(newStatus === 'archived' ? 'Environment archived successfully' : 'Environment restored successfully');
            setArchiveEntity(null);
        } catch (error) {
            console.warn("Error toggling archive in Firestore, fallback local:", error);
            setEntities((prev) => {
                const updated = prev.map((e) => e.id === entity.id ? { ...e, status: newStatus } : e);
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success(newStatus === 'archived' ? 'Environment archived successfully' : 'Environment restored successfully');
            setArchiveEntity(null);
        }
    };

    const handleDeleteEntity = async () => {
        if (!deleteEntity || !currentUser) return;

        // Personal environment protected against deletion
        if (deleteEntity.type === 'persona') {
            toast.error('The personal environment cannot be deleted.');
            setDeleteEntity(null);
            setInputValue('');
            return;
        }

        const targetName = deleteEntity.name?.trim() || deleteEntity.slug?.trim() || 'delete';
        if (inputValue.trim().toLowerCase() !== targetName.toLowerCase()) return;

        if (currentUser.uid.startsWith('demo')) {
            setEntities((prev) => {
                const updated = prev.filter((e) => e.id !== deleteEntity.id);
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success('Environment deleted successfully');
            setDeleteEntity(null);
            setInputValue('');
            return;
        }

        try {
            const ref = doc(db, `users/${currentUser.uid}/entities/${deleteEntity.id}`);
            try {
                await releaseEntitySlug(currentUser.uid, deleteEntity.slug);
            } catch (err) {
                console.warn("Could not release slug:", err);
            }
            await deleteDoc(ref);
            toast.success('Environment deleted successfully');
            setDeleteEntity(null);
            setInputValue('');
        } catch (error) {
            console.warn("Error deleting environment in Firestore, fallback local:", error);
            setEntities((prev) => {
                const updated = prev.filter((e) => e.id !== deleteEntity.id);
                try {
                    localStorage.setItem('elizmey_demo_entities', JSON.stringify(updated));
                } catch {}
                return updated;
            });
            toast.success('Environment deleted successfully');
            setDeleteEntity(null);
            setInputValue('');
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center selection:bg-white/10 relative overflow-hidden">

            {/* Blue Particles Dynamic Canvas Background */}
            <BlueParticles />

            {/* Left Edge Floating Dock (Manage & Sign out, icon-only) */}
            <LeftFloatingBar
                managementMode={managementMode}
                onToggleManagement={() => setManagementMode(!managementMode)}
                onLogout={handleLogout}
            />

            {/* Right Edge Floating Dock (Edit profiles & Sign out, icon-only) */}
            <RightFloatingBar
                currentUser={currentUser}
                managementMode={managementMode}
                onToggleManagement={() => setManagementMode(!managementMode)}
                onLogout={handleLogout}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="z-10 w-full max-w-6xl px-6 flex flex-col items-center"
            >
                <h1 className="mt-24 md:mt-0 text-2xl md:text-4xl font-light tracking-tight text-center mb-10 md:mb-16 text-white/90 px-4">
                    {managementMode ? 'Digital Assets Management' : 'Which environment would you like to enter?'}
                </h1>

                {managementMode && ghostEntities.length > 0 && (
                    <p className="mb-8 max-w-lg text-center text-amber-300/80 text-xs tracking-tight font-light px-4">
                        There are {ghostEntities.length} duplicate environment(s). You can delete them with the trash icon without affecting your main business.
                    </p>
                )}

                <div className="flex flex-wrap justify-center gap-10 md:gap-14">

                    <AnimatePresence mode='popLayout'>
                        {/* Dynamic Rendering of Entities */}
                        {listedEntities.map((entity) => (
                            <motion.div
                                key={entity.id}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className={`flex flex-col items-center gap-4 relative group ${transitioning && transitioning !== entity.id ? 'opacity-20 blur-sm scale-95' : ''} ${entity.status === 'archived' ? 'opacity-40 grayscale' : ''}`}
                            >
                                {/* Floating Actions for Management Mode */}
                                {managementMode && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center gap-1 bg-[#141518]/90 backdrop-blur-md border border-white/10 rounded-full px-2 py-1 shadow-lg z-30 mb-1"
                                    >
                                        <button
                                            onClick={() => {
                                                setEditEntity(entity);
                                                setInputValue(entity.name || '');
                                                setSlugValue(entity.slug || slugifyEntityName(entity.name || entity.id));
                                                setSlugError('');
                                                setEditPhotoFile(null);
                                                setEditPhotoPreview(resolveEntityPhoto(entity) || null);
                                            }}
                                            title="Edit environment"
                                            className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <div className="w-px h-3 bg-white/10" />
                                        <button
                                            onClick={() => setArchiveEntity(entity)}
                                            title={entity.status === 'archived' ? 'Restore' : 'Archive'}
                                            className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-amber-400 transition-colors"
                                        >
                                            {entity.status === 'archived' ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                        </button>
                                        {entity.type !== 'persona' && (
                                            <>
                                                <div className="w-px h-3 bg-white/10" />
                                                <button
                                                    onClick={() => { setDeleteEntity(entity); setInputValue(''); }}
                                                    title="Delete environment"
                                                    className="p-1.5 rounded-full hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </>
                                        )}
                                    </motion.div>
                                )}

                                <div
                                    onClick={() => handleSelectEntity(entity)}
                                    className={`w-32 h-32 md:w-36 md:h-36 rounded-full transition-all cursor-pointer ${!managementMode ? 'hover:scale-105 active:scale-95 shadow-2xl hover:shadow-blue-500/20' : 'cursor-default'}`}
                                >
                                    <Avatar className="w-full h-full shadow-2xl">
                                        <AvatarImage
                                            src={resolveEntityPhoto(entity)}
                                            alt={entity.name || ''}
                                            className="object-cover"
                                            referrerPolicy="no-referrer"
                                        />
                                        <AvatarFallback className={`text-white text-4xl md:text-5xl font-light ${entity.type === 'persona' ? 'bg-gradient-to-tr from-emerald-800 to-teal-700' : 'bg-gradient-to-tr from-blue-800 to-indigo-700'}`}>
                                            {entity.name ? entity.name[0].toUpperCase() : '•'}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>

                                <div className="text-center group-hover:translate-y-0.5 transition-transform">
                                    <span className="text-base sm:text-lg font-light block transition-colors text-white/90 group-hover:text-white tracking-tight">
                                        {entity.name || 'Untitled'}
                                    </span>
                                    {ghostIds.has(entity.id) ? (
                                        <span className="text-[11px] text-amber-400/80 font-light mt-0.5 block tracking-tight">
                                            Duplicate (suggested to delete)
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-white/40 font-light mt-0.5 block tracking-tight">
                                            {entityTypeLabel(entity)}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Add Account Option */}
                    {!managementMode && (
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`flex flex-col items-center gap-4 cursor-pointer group transition-all duration-300 ${transitioning ? 'opacity-20 scale-95 blur-sm' : ''}`}
                            onClick={() => { setIsCreating(true); setInputValue(''); }}
                        >
                            <div className="w-32 h-32 md:w-36 md:h-36 rounded-full border-2 border-dashed border-white/15 flex items-center justify-center group-hover:border-white/30 transition-all bg-white/[0.02] group-hover:bg-white/[0.05]">
                                <Plus className="w-8 h-8 text-white/30 group-hover:text-white/70 group-hover:rotate-90 transition-all duration-500" />
                            </div>
                            <div className="text-center">
                                <span className="text-xs font-light text-white/40 group-hover:text-white transition-colors tracking-tight">
                                    Create environment
                                </span>
                            </div>
                        </motion.div>
                    )}

                </div>
            </motion.div>

            {/* --- CRUD MODALS --- */}

            <AnimatePresence>
                {/* Modal: Edit */}
                {editEntity && (
                    <Modal
                        title="Edit environment"
                        subtitle="Customize the photo, name, and access route of your environment."
                        onClose={handleCloseEdit}
                    >
                        <div className="space-y-6">
                            {/* Avatar Photo Selector */}
                            <div className="flex flex-col items-center justify-center py-2">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    onChange={handlePhotoChange}
                                    className="hidden"
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="relative group cursor-pointer"
                                    title="Click to change image"
                                >
                                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-white/25 shadow-2xl overflow-hidden relative group-hover:border-blue-400 group-hover:scale-105 transition-all bg-neutral-900/60 shadow-[0_0_35px_rgba(59,130,246,0.25)]">
                                        {editPhotoPreview ? (
                                            <img
                                                src={editPhotoPreview}
                                                alt="Preview"
                                                referrerPolicy="no-referrer"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className={`w-full h-full flex items-center justify-center text-white text-4xl font-light ${editEntity.type === 'persona' ? 'bg-gradient-to-tr from-emerald-700 to-teal-600' : 'bg-gradient-to-tr from-blue-700 via-indigo-700 to-cyan-600'}`}>
                                                {inputValue ? inputValue[0]?.toUpperCase() : '•'}
                                            </div>
                                        )}
                                        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
                                            <Camera className="w-7 h-7 text-white" />
                                            <span className="text-[10px] text-white/90 uppercase tracking-[0.2em] mt-1.5 font-light">Upload</span>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-1 right-1 p-2.5 bg-gradient-to-tr from-blue-500 to-cyan-500 rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] border-2 border-neutral-950 group-hover:scale-110 transition-transform z-10">
                                        <Camera className="w-4 h-4 text-white" />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-3.5 text-xs text-cyan-400 hover:text-cyan-300 font-light tracking-tight transition-colors"
                                >
                                    {editPhotoPreview ? 'Change photo or logo' : 'Upload photo or logo'}
                                </button>
                                <p className="text-[11px] text-white/50 mt-1 text-center font-light tracking-tight max-w-xs leading-relaxed">
                                    {editEntity.type === 'persona'
                                        ? 'Personalize your profile photo (replaces Google avatar)'
                                        : 'Personalize the logo representing your environment'}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-light uppercase tracking-wider text-white/60">Environment Name</label>
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    className="w-full bg-white/[0.05] border border-white/15 rounded-2xl px-4 py-3.5 text-sm font-light tracking-tight text-white placeholder:text-white/30 focus:border-blue-400 focus:bg-white/[0.08] focus:ring-4 focus:ring-blue-500/15 focus:outline-none transition-all"
                                    placeholder="Environment name..."
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-light uppercase tracking-wider text-white/60">Access Route (Slug)</label>
                                <div className="flex items-center bg-white/[0.05] border border-white/15 rounded-2xl px-4 py-3.5 text-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/15 transition-all">
                                    <span className="text-white/40 font-light tracking-tight text-xs mr-1 select-none">elizmey.com/home/</span>
                                    <input
                                        type="text"
                                        value={slugValue}
                                        onChange={(e) => {
                                             setSlugValue(slugifyEntityName(e.target.value));
                                             setSlugError('');
                                        }}
                                        className="w-full bg-transparent text-cyan-400 font-light tracking-tight text-sm focus:outline-none"
                                        placeholder="my-company"
                                     />
                                </div>
                                {slugError && (
                                    <p className="text-red-400 text-xs font-light tracking-tight mt-1.5">{slugError}</p>
                                )}
                                <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed font-light tracking-tight">
                                    Changing the route will update this environment's link across the platform.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                                <button
                                    type="button"
                                    disabled={savingEdit}
                                    onClick={handleCloseEdit}
                                    className="h-11 px-5 rounded-2xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] disabled:opacity-50 text-white/70 hover:text-white text-xs font-light tracking-tight transition-all"
                                >
                                    Cancel
                                </button>
                                <Button
                                    onClick={handleUpdateEntity}
                                    disabled={savingEdit || !inputValue.trim()}
                                    className="h-11 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-2xl text-xs font-light tracking-tight transition-all shadow-[0_0_25px_rgba(59,130,246,0.4)] flex items-center gap-2"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        <span>{savingEdit ? 'Saving...' : 'Save changes'}</span>
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </Modal>
                )}

                {/* Modal: Safe Delete */}
                {deleteEntity && (
                    <Modal
                        title="Delete environment"
                        subtitle="This action is irreversible and will delete data linked to this environment."
                        onClose={() => { setDeleteEntity(null); setInputValue(''); }}
                    >
                        <div className="space-y-4">
                            <div className="flex items-start gap-3.5 text-red-400 bg-red-500/10 p-4 rounded-2xl border border-red-500/25 backdrop-blur-sm">
                                <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5 text-red-400" />
                                <p className="text-xs leading-relaxed font-light tracking-tight text-red-200">
                                    All data associated with this environment will be permanently removed.
                                </p>
                            </div>

                            {(() => {
                                const targetName = deleteEntity.name?.trim() || deleteEntity.slug?.trim() || 'delete';
                                const isMatch = inputValue.trim().toLowerCase() === targetName.toLowerCase();
                                return (
                                    <div className="space-y-3">
                                        <p className="text-xs text-white/70 font-light tracking-tight">
                                            To confirm, type <span className="text-red-400 font-light tracking-tight bg-red-500/10 border border-red-500/25 px-2 py-0.5 rounded-lg text-xs select-all">{targetName}</span>:
                                        </p>
                                        <input
                                            type="text"
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            className="w-full bg-white/[0.05] border border-white/15 rounded-2xl px-4 py-3.5 text-sm font-light tracking-tight text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none transition-all"
                                            placeholder={`Type "${targetName}"...`}
                                            autoFocus
                                        />

                                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-4">
                                            <button
                                                type="button"
                                                onClick={() => { setDeleteEntity(null); setInputValue(''); }}
                                                className="h-11 px-5 rounded-2xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-white/70 hover:text-white text-xs font-light tracking-tight transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <Button
                                                onClick={handleDeleteEntity}
                                                disabled={!isMatch}
                                                className="h-11 px-6 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white rounded-2xl text-xs font-light tracking-tight transition-all shadow-lg shadow-red-600/30"
                                            >
                                                Delete permanently
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </Modal>
                )}

                {/* Modal: Archive */}
                {archiveEntity && (
                    <Modal
                        title={archiveEntity.status === 'archived' ? "Restore environment" : "Archive environment"}
                        subtitle={archiveEntity.status === 'archived'
                            ? "Do you want to reactivate this environment in the main Home list?"
                            : "The environment will be hidden from the main list, but its data is preserved and can be restored anytime."}
                        onClose={() => setArchiveEntity(null)}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => setArchiveEntity(null)}
                                    className="h-11 px-5 rounded-2xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-white/70 hover:text-white text-xs font-light tracking-tight transition-all"
                                >
                                    Cancel
                                </button>
                                <Button
                                    onClick={() => handleToggleArchive(archiveEntity)}
                                    className={`h-11 px-6 text-white rounded-2xl text-xs font-light tracking-tight transition-all shadow-lg ${archiveEntity.status === 'archived' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30' : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'}`}
                                >
                                    {archiveEntity.status === 'archived' ? 'Restore environment' : 'Archive environment'}
                                </Button>
                            </div>
                        </div>
                    </Modal>
                )}

                {/* Modal: Create */}
                {isCreating && (
                    <Modal
                        title="Crear entorno personal"
                        subtitle="Ingresa el nombre para tu nuevo espacio de mensajería y automatización."
                        onClose={() => { setIsCreating(false); setInputValue(''); }}
                    >
                        <div className="space-y-6">
                            <div className="flex justify-center my-1">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-cyan-300 shadow-[0_0_20px_rgba(59,130,246,0.25)]">
                                    <UserIcon className="w-8 h-8" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-light uppercase tracking-wider text-white/60">Nombre del Entorno</label>
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    className="w-full bg-white/[0.05] border border-white/15 rounded-2xl px-4 py-3.5 text-sm font-light tracking-tight text-white placeholder:text-white/30 focus:border-blue-400 focus:bg-white/[0.08] focus:ring-4 focus:ring-blue-500/15 focus:outline-none transition-all"
                                    placeholder="Ej: Mi Espacio Personal"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && inputValue.trim() && !creatingProgress) {
                                            handleCreateEntity();
                                        }
                                    }}
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => { setIsCreating(false); setInputValue(''); }}
                                    className="h-11 px-5 rounded-2xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-white/70 hover:text-white text-xs font-light tracking-tight transition-all"
                                >
                                    Cancelar
                                </button>
                                <Button
                                    onClick={handleCreateEntity}
                                    disabled={creatingProgress || !inputValue.trim()}
                                    className="h-11 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-blue-600/40 text-white rounded-2xl text-xs font-light tracking-tight transition-all shadow-lg flex items-center gap-2"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        {creatingProgress && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        <span>{creatingProgress ? 'Creando...' : 'Crear entorno personal'}</span>
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>

            <AskRooseveltBar />

        </div>
    );
}

// Componente Local de Modal Premium (Transparente, Frosted Glass, Fondo Transparente)
function Modal({
    title,
    subtitle,
    children,
    onClose
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/20 backdrop-blur-[2px] p-4 sm:p-6"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 15 }}
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                className="w-full max-w-lg bg-neutral-950/45 backdrop-blur-2xl border border-white/20 rounded-[32px] shadow-[0_30px_90px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)] p-6 sm:p-8 relative overflow-hidden"
            >
                {/* Luminous subtle ambient glows inside the frosted glass card */}
                <div className="absolute -top-24 -left-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="flex items-start justify-between gap-4 mb-6 pb-4 border-b border-white/10 relative z-10">
                    <div>
                        <h2 className="text-xl font-light text-white tracking-tight">{title}</h2>
                        {subtitle && (
                            <p className="text-xs text-white/60 mt-1 font-light tracking-tight leading-relaxed">{subtitle}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.15] border border-white/15 flex items-center justify-center text-white/60 hover:text-white transition-all shrink-0 active:scale-95"
                        aria-label="Close modal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="relative z-10">
                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
}
