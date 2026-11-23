'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  User as UserIcon, Settings, CreditCard, Home, 
  LogOut, X, Camera 
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

export function WorkspaceUserMenu() {
  const router = useRouter();
  const { currentUser, activeEntity } = useAuth();
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<{ name: string; type?: string; logoUrl?: string } | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    // Fetch user photo from users/{uid}
    const fetchUser = async () => {
      if (currentUser?.photoURL) {
        setUserPhoto(currentUser.photoURL);
      }
      try {
        const userSnap = await getDoc(doc(db, `users/${currentUser.uid}`));
        if (userSnap.exists()) {
          const d = userSnap.data();
          if (d?.photoURL) setUserPhoto(d.photoURL);
        }
      } catch (err) {
        console.warn('User photo fetch handled:', err);
      }
    };

    fetchUser();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !activeEntity) return;

    if (activeEntity === 'personal' || activeEntity === 'life') {
      setEntityData({
        name: 'Personal',
        type: 'persona',
        logoUrl: currentUser.photoURL || undefined,
      });
      return;
    }

    const fetchEntity = async () => {
      try {
        const entSnap = await getDoc(doc(db, `users/${currentUser.uid}/entities/${activeEntity}`));
        if (entSnap.exists()) {
          const d = entSnap.data();
          setEntityData({
            name: d.name || 'Environment',
            type: d.type,
            logoUrl: d.logoUrl || d.customPhotoURL,
          });
        }
      } catch (err) {
        console.warn('Entity data fetch handled:', err);
      }
    };

    fetchEntity();
  }, [currentUser, activeEntity]);

  if (!currentUser) return null;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (e) {
      toast.error('Error signing out');
    }
  };

  const isPersonal = entityData?.type === 'persona';
  const photo = isPersonal 
    ? (entityData?.logoUrl || userPhoto || currentUser.photoURL || '')
    : (entityData?.logoUrl || '');

  return (
    <div className="fixed top-8 right-8 z-[2000]">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="relative focus:outline-none group">
            <div className="absolute inset-[-4px] rounded-full border border-blue-500/0 group-hover:border-blue-500/40 transition-all duration-500" />
            <Avatar className="w-9 h-9 border border-white/10 shadow-xl transition-transform group-hover:scale-105 active:scale-95">
              {photo && <AvatarImage src={photo} referrerPolicy="no-referrer" />}
              <AvatarFallback className={`text-white font-normal text-xs ${isPersonal ? 'bg-gradient-to-tr from-emerald-800 to-teal-700' : 'bg-gradient-to-tr from-blue-800 to-indigo-700'}`}>
                {entityData?.name?.[0]?.toUpperCase() || (isPersonal ? (currentUser.displayName?.[0] || 'P') : 'E')}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={12}
            className="w-[calc(100vw-32px)] md:w-[320px] bg-[#141518] border border-white/10 rounded-2xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] backdrop-blur-3xl animate-in fade-in slide-in-from-top-3 duration-200 z-[2100] overflow-hidden p-0 text-white"
          >
            <div className="flex justify-between items-center px-4 pt-4 mb-1">
              <div className="flex-1 text-center">
                {isPersonal ? (
                  <p className="text-[11px] font-normal text-white/50 tracking-normal lowercase">{currentUser.email}</p>
                ) : (
                  <p className="text-[10px] font-normal text-white/40 tracking-wider uppercase">
                    {entityData?.type === 'creador' ? 'Creator Environment' : 'Business Environment'}
                  </p>
                )}
              </div>
              <DropdownMenu.Item className="focus:outline-none cursor-pointer">
                <X className="w-3.5 h-3.5 text-white/40 hover:text-white transition-colors" />
              </DropdownMenu.Item>
            </div>

            <div className="flex flex-col items-center px-4 pb-4 text-center">
              <div className="relative mb-3 group cursor-pointer" onClick={() => router.push(isPersonal ? '/perfil' : '/configuracion')}>
                <Avatar className="w-16 h-16 border border-white/10 shadow-xl">
                  {photo && <AvatarImage src={photo} referrerPolicy="no-referrer" />}
                  <AvatarFallback className={`text-xl font-normal text-white ${isPersonal ? 'bg-gradient-to-tr from-emerald-800 to-teal-700' : 'bg-gradient-to-tr from-blue-800 to-indigo-700'}`}>
                    {entityData?.name?.[0]?.toUpperCase() || (isPersonal ? (currentUser.displayName?.[0] || 'P') : 'E')}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute bottom-0 right-0 p-1 bg-[#24262b] border border-white/10 rounded-full shadow-lg group-hover:scale-110 transition-transform">
                  <Camera className="w-3 h-3 text-white/60" />
                </div>
              </div>

              <h3 className="text-base font-normal text-white mb-1">
                {entityData?.name || (isPersonal ? (currentUser.displayName?.split(' ')[0] || 'Personal') : entityData?.type === 'creador' ? 'Creator' : 'Business')}
              </h3>
              {entityData?.type && (
                <span className={`text-[10px] uppercase tracking-wider font-normal mb-3 ${isPersonal ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {isPersonal ? 'Personal Environment' : entityData?.type === 'creador' ? 'Creator Environment' : 'Business Environment'}
                </span>
              )}

              <button
                type="button"
                onClick={() => router.push('/configuracion')}
                className="px-4 py-2 border border-white/10 rounded-full text-xs font-normal text-blue-400 hover:bg-blue-500/5 transition-all w-full max-w-[220px]"
              >
                Manage account
              </button>
            </div>

            <div className="bg-black/30 p-3 border-y border-white/5">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "Home", icon: Home, href: "/home" },
                  { label: "Profile", icon: UserIcon, href: "/perfil" },
                  { label: "Settings", icon: Settings, href: "/configuracion" },
                  { 
                    label: "Subscription", 
                    icon: CreditCard, 
                    href: activeEntity ? `/subscriptions?entityId=${activeEntity}` : '/subscriptions' 
                  },
                ].map((item) => (
                  <DropdownMenu.Item
                    key={item.label}
                    onClick={() => router.push(item.href)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/5 cursor-pointer outline-none transition-all group"
                  >
                    <item.icon className="w-4 h-4 text-white/40 group-hover:text-blue-400 transition-colors" />
                    <span className="text-[10px] font-normal text-white/40 group-hover:text-white/80">{item.label}</span>
                  </DropdownMenu.Item>
                ))}
              </div>
            </div>

            <div className="p-3 flex gap-2">
              <DropdownMenu.Item
                onClick={handleLogout}
                className="flex-1 bg-white/[0.03] hover:bg-red-500/10 rounded-xl py-2 flex items-center justify-center gap-2 cursor-pointer outline-none transition-all group"
              >
                <LogOut className="w-3.5 h-3.5 text-white/40 group-hover:text-red-400" />
                <span className="text-xs font-normal text-white/60 group-hover:text-red-400">Sign out</span>
              </DropdownMenu.Item>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
