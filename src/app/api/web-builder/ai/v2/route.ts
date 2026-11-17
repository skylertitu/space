import { NextResponse } from 'next/server';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SYSTEM_PROMPT } from '../prompt';
import { db, admin } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';
import { requireSuite } from '@/lib/subscriptions/entitlements.server';

// Force load environment variables
dotenv.config();

console.log("[AI Route] 🚀 Booting AI Route. VertexAI SA:", !!process.env.VERTEX_AI_SERVICE_ACCOUNT, "| Firebase SA:", !!process.env.FIREBASE_SERVICE_ACCOUNT);

// Design pass for visual excellence
const REFINE_PROMPT = `
You are an Elite UI/UX Design Critic and Framer Motion Expert. Your job is to perform a FINAL visual pass on the provided code to ensure it meets world-class standards (Lovable/V0 quality).

1. INTENT ANALYSIS & VISUAL FIDELITY:
   - If TECH/CODING: Dark mode (#050505), glow effects, sharp typography, subtle grid lines, and interactive terminal-like components.
   - If LIFESTYLE/BOUTIQUE: Soft rounding (rounded-[3rem]), massive white space, organic floating animations, and elegant serif typography.
   - If CORPORATE: High-contrast, expert bento-grids, subtle hover-lift, and premium professional color palettes.

2. UNIVERSAL DIRECTIVES (MANDATORY):
   - GLASSMORPHISM: Apply 'backdrop-blur-xl bg-white/5 border border-white/10' (dark) or 'bg-white/40 border-white/60' (light).
   - TYPOGRAPHY: Hero titles MUST BE 'text-6xl md:text-9xl font-black tracking-tighter leading-[0.8] mb-8'.
   - SPACING: Mandate 'py-32 md:py-48' for hero sections. No "small" padding.
   - BENTO-GRIDS: Convert repetitive lists into irregular, exciting Bento-grids with varied sizes and spanning.
   - ANIMATIONS: Use 'framer-motion'. Add 'animate-float' to main visuals. Every section MUST have a scroll reveal: 'initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}'.
   - INTERACTION: Every card and button MUST have a hover effect: 'whileHover={{ y: -10, scale: 1.02 }}'.

3. EXTREME SCALE & DEPTH (CRITICAL):
   - ONE PAGE IS NEVER ENOUGH: If the input is a single-page landing for a business, TRANSFORMATION into a multi-page HashRouter app is mandatory.
   - DEPTH: Every module MUST be fully populated with real-looking copywriting, high-quality Unsplash image URLs (Coffee, Business, Tech), and detailed sub-sections.
   - GLOBAL FEEL: Ensure a massive Footer and a premium sticky Navbar are present and functional across all routes.

🚨 VALIDATION & LINTING (CRITICAL) 🚨
- ICON AUDIT: Use valid 'lucide-react' icons ONLY.
- REACT ERROR #130: Verify every single component import.
- CLEANUP: Remove any business logic commentary from the code.

RULES:
- Maintain EXACT JSON structure.
- RETURN COMPLETE FILE CONTENT.
- EXCEED expectations in complexity.
`;

function logToFile(msg: string) {
  try {
    const logPath = path.join(process.cwd(), 'ai-route.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    console.error('Logging failed', e);
  }
}

// Lazy Clients
let vertexAI: any = null;

function parseServiceAccountEnv(envValue: string): any | null {
  if (!envValue) return null;
  try {
    let cleaned = envValue.trim();
    // Strip wrapping single or double quotes
    if ((cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // If the string contains literal newlines, we need to escape them for JSON.parse
    // but only if they are not already escaped. This is tricky.
    // Usually, the issue is that \n in .env is read as \\n.
    // If we have literal newlines, we should replace them with \\n.
    cleaned = cleaned.replace(/\n/g, '\\n');

    return JSON.parse(cleaned);
  } catch (e: any) {
    console.error(`[Vertex AI] Failed to parse Service Account JSON: ${e.message}`);
    // Last ditch attempt: try to fix the private key specifically
    try {
        // If it failed, it might be because of the private key format.
        // We'll try to find the private key and escape it manually.
        return null; 
    } catch { return null; }
  }
}

function getVertexAI(location: string = 'us-central1') {
  console.log(`[Vertex AI] Initializing client for ${location}...`);
  let keyOptions: any = {};
  let saProject = '';

  const saEnv = process.env.VERTEX_AI_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saEnv) {
    const credentials = parseServiceAccountEnv(saEnv);
    if (credentials) {
      if (credentials.private_key && typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      keyOptions = { credentials };
      saProject = credentials.project_id;
    }
  }

  const project = saProject || process.env.GOOGLE_CLOUD_PROJECT || 'roosevelt-491004';

  try {
    return new VertexAI({
      project,
      location,
      googleAuthOptions: {
        credentials: keyOptions.credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      }
    });
  } catch (err: any) {
    console.error(`[Vertex AI] ❌ Initialization Error: ${err.message}`);
    return null;
  }
}




// ============================================================================
// Cascading Fuzzy Matching System (Dyad-Inspired)
// Implements 4 passes with decreasing strictness:
//   Pass 1: Exact Match
//   Pass 2: Trailing Whitespace Ignored
//   Pass 3: All Edge Whitespace Ignored
//   Pass 4: Canonical (all whitespace, commas, semicolons collapsed)
// ============================================================================

type LineComparator = (fileLine: string, patternLine: string) => boolean;

const exactMatch: LineComparator = (a, b) => a === b;
const trailingWSIgnored: LineComparator = (a, b) => a.trimEnd() === b.trimEnd();
const allEdgeWSIgnored: LineComparator = (a, b) => a.trim() === b.trim();
const canonicalMatch: LineComparator = (a, b) =>
  a.replace(/[\s\n\r\t,;]+/g, '').trim() === b.replace(/[\s\n\r\t,;]+/g, '').trim();

const MATCHING_PASSES: { name: string; cmp: LineComparator }[] = [
  { name: 'exact', cmp: exactMatch },
  { name: 'trailing-ws', cmp: trailingWSIgnored },
  { name: 'all-edge-ws', cmp: allEdgeWSIgnored },
  { name: 'canonical', cmp: canonicalMatch },
];

function findMatchPositions(resultLines: string[], searchLines: string[], cmp: LineComparator): number[] {
  const positions: number[] = [];
  for (let i = 0; i <= resultLines.length - searchLines.length; i++) {
    let allMatch = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (!cmp(resultLines[i + j], searchLines[j])) { allMatch = false; break; }
    }
    if (allMatch) {
      positions.push(i);
      if (positions.length > 1) break; // Ambiguity detected, stop early
    }
  }
  return positions;
}

function trimEmptyLines(lines: string[]): string[] {
  const result = [...lines];
  while (result.length > 0 && result[0] === '') result.shift();
  while (result.length > 0 && result[result.length - 1] === '') result.pop();
  return result;
}

function cascadingMatch(resultLines: string[], searchLines: string[]): { matchIndex: number; error?: string; passName?: string } {
  for (const pass of MATCHING_PASSES) {
    const positions = findMatchPositions(resultLines, searchLines, pass.cmp);
    if (positions.length > 1) {
      return { matchIndex: -1, error: `Ambiguous match in ${pass.name} pass` };
    }
    if (positions.length === 1) {
      if (pass.name !== 'exact') logToFile(`[cascadingMatch] Matched via "${pass.name}" pass.`);
      return { matchIndex: positions[0], passName: pass.name };
    }
  }
  return { matchIndex: -1, error: 'No match found in any pass.' };
}

function applySearchReplace(content: string, search: string, replace: string): string {
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  let resultLines = content.split(/\r?\n/);
  let searchLines = search.split(/\r?\n/);
  const replaceLines = replace.split(/\r?\n/);

  if (searchLines.length === 0 || (searchLines.length === 1 && searchLines[0] === '')) {
    logToFile('[applySearchReplace] WARNING: Empty search block.');
    return content;
  }

  // Attempt cascading match
  let matchResult = cascadingMatch(resultLines, searchLines);

  // Fallback: try trimming leading/trailing empty lines from search
  if (matchResult.error && !matchResult.error.includes('Ambiguous')) {
    const trimmed = trimEmptyLines(searchLines);
    if (trimmed.length !== searchLines.length && trimmed.length > 0) {
      const trimmedResult = cascadingMatch(resultLines, trimmed);
      if (!trimmedResult.error) {
        matchResult = trimmedResult;
        searchLines = trimmed;
        logToFile('[applySearchReplace] Matched after trimming empty lines from search block.');
      }
    }
  }

  if (matchResult.error) {
    logToFile(`[applySearchReplace] WARNING: ${matchResult.error}`);
    return content; // Return unchanged
  }

  const matchIndex = matchResult.matchIndex;
  const matchedLines = resultLines.slice(matchIndex, matchIndex + searchLines.length);

  // Preserve indentation relative to the first matched line
  const originalBaseIndent = (matchedLines[0]?.match(/^[\t ]*/) || [''])[0];
  const searchBaseIndent = (searchLines[0]?.match(/^[\t ]*/) || [''])[0];
  const searchBaseLevel = searchBaseIndent.length;

  const indentedReplaceLines = replaceLines.map(line => {
    const currentIndentMatch = line.match(/^[\t ]*/);
    const currentIndent = currentIndentMatch ? currentIndentMatch[0] : '';
    const currentLevel = currentIndent.length;
    const relativeLevel = currentLevel - searchBaseLevel;

    const finalIndent = relativeLevel < 0
      ? originalBaseIndent.slice(0, Math.max(0, originalBaseIndent.length + relativeLevel))
      : originalBaseIndent + currentIndent.slice(searchBaseLevel);

    return finalIndent + line.trim();
  });

  const beforeMatch = resultLines.slice(0, matchIndex);
  const afterMatch = resultLines.slice(matchIndex + searchLines.length);
  resultLines = [...beforeMatch, ...indentedReplaceLines, ...afterMatch];

  logToFile(`[applySearchReplace] SUCCESS: Applied edit at line ${matchIndex + 1} (${matchResult.passName} pass).`);
  return resultLines.join(lineEnding);
}

function parseSearchReplace(text: string): { search: string; replace: string }[] {
  const deltas: { search: string; replace: string }[] = [];
  const regex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    deltas.push({ search: match[1], replace: match[2] });
  }
  return deltas;
}

function extractJSON(responseText: string, currentFiles: Record<string, string> = {}) {
  // Guard against undefined/null responseText
  if (!responseText || typeof responseText !== 'string') {
    logToFile(`[extractJSON] ERROR: responseText is ${typeof responseText}. Returning error message.`);
    return { type: "message", content: "Error: La IA no devolvió una respuesta válida. Reintenta en unos segundos." };
  }

  // 1. Capture <think> tags but DON'T strip them yet from the raw text for the final output
  const thinkMatch = responseText.match(/<think>([\s\S]*?)<\/think>/);
  const thinking = thinkMatch ? thinkMatch[0] : "";
  
  // Cleaned text for JSON searching (we still strip for parsing)
  let cleaned = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // If after stripping think tags there's nothing left, the AI only "thought" but produced no output
  if (!cleaned || cleaned.length < 2) {
    logToFile(`[extractJSON] AI returned only think tags with no actual output.`);
    return { type: "message", content: thinking + "\n\nLa IA analizó tu solicitud pero no generó código. Reintenta con una instrucción más específica." };
  }

  // Try to find ALL dyad-search-replace tags
  const dyadRegex = /<dyad-search-replace path="([^"]*)"(?:\s+description="([^"]*)")?>([\s\S]*?)<\/dyad-search-replace>/g;
  let dyadMatches: { path: string; description?: string; body: string }[] = [];
  let match;

  while ((match = dyadRegex.exec(cleaned)) !== null) {
    dyadMatches.push({ path: match[1], description: match[2], body: match[3] });
  }

  if (dyadMatches.length > 0) {
    const virtualFiles = { ...currentFiles };
    let successCount = 0;
    let failCount = 0;
    let appliedPaths: string[] = [];
    let failedPaths: string[] = [];

    for (const dyad of dyadMatches) {
      const deltas = parseSearchReplace(dyad.body);
      let content = virtualFiles[dyad.path] || "";

      if (!content && dyad.path.startsWith('src/')) {
        const altPath = dyad.path.replace('src/', '');
        content = virtualFiles[altPath] || "";
      }

      let fileEditsApplied = 0;
      for (const delta of deltas) {
        const newContent = applySearchReplace(content, delta.search, delta.replace);
        if (newContent !== content) {
          content = newContent;
          fileEditsApplied++;
        }
      }

      if (fileEditsApplied > 0) {
        virtualFiles[dyad.path] = content;
        successCount++;
        appliedPaths.push(dyad.path.split('/').pop() || "");
      } else {
        failCount++;
        failedPaths.push(dyad.path.split('/').pop() || "");
      }
    }

    let report = "";
    if (successCount > 0) {
      report += `✅ Actualizado: ${appliedPaths.join(', ')}. `;
    }
    if (failCount > 0) {
      report += `⚠️ No se pudo aplicar el cambio en: ${failedPaths.join(', ')} (el código original no coincide exactamente).`;
    }

    const filesToReturn = Object.entries(virtualFiles)
      .filter(([path, content]) => currentFiles[path] !== content)
      .map(([path, content]) => ({ path, content }));

    return {
      type: "code_update",
      files: filesToReturn,
      content: thinking + "\n\n" + (report || "Surgical update processed.")
    };
  }

  try {
    // 2. Locate the outermost JSON object
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      // FALLBACK: If no JSON is found, treat the entire cleaned text as a message
      logToFile(`[extractJSON] No JSON found. Returning as plain message.`);
      return { 
        type: "message", 
        content: thinking + "\n\n" + cleaned 
      };
    }

    let jsonPart = cleaned.substring(start, end + 1);
    jsonPart = jsonPart.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');

    try {
      jsonPart = jsonPart.split('\n').map(line => line.trim() === '' ? '\\n' : line).join('');
    } catch (e) { }
    
    jsonPart = jsonPart.replace(/,\s*([\]}])/g, '$1');

    const parsed = JSON.parse(jsonPart);

    // Prepend thinking to content if it exists
    if (thinking && parsed.content !== undefined) {
      parsed.content = thinking + "\n\n" + parsed.content;
    } else if (thinking && !parsed.content) {
      parsed.content = thinking;
    }

    if (parsed.type === 'code_update' && (!parsed.content || parsed.content.includes('.tsx'))) {
      parsed.content = (thinking ? thinking + "\n\n" : "") + "He aplicado los cambios solicitados en el diseño y la estructura.";
    }

    return parsed;
  } catch (e: any) {
    logToFile(`[extractJSON] Failed to parse JSON: ${e.message}.`);

    // Another fallback: just return the cleaned text
    return { 
      type: "message", 
      content: thinking + "\n\n" + cleaned 
    };
  }
}


async function callVertex(modelName: string, messages: any[], fileContext: string, apiKeys: string[]) {
  // Shuffle keys to distribute load
  const keys = (Array.isArray(apiKeys) ? apiKeys : [apiKeys])
    .sort(() => Math.random() - 0.5);
  
  logToFile(`[callVertex] Model: ${modelName}, Context Length: ${fileContext.length}, Keys Available: ${keys.length}`);

  let lastError: any = null;

  for (const key of keys) {
    if (!key || key === "your_gemini_api_key") continue;
    
    try {
      const prepareContents = (msgs: any[]) => {
        const contents = msgs.map(m => {
          const parts: any[] = [{ text: m.content || "" }];
          if (m.images) {
            m.images.forEach((img: any) => {
              parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
            });
          }
          return { role: m.role === 'ai' || m.role === 'model' ? 'model' : 'user', parts };
        });

        if (contents.length > 0) {
          contents[0].parts.unshift({ text: SYSTEM_PROMPT });
        }

        const lastUserMsg = [...contents].reverse().find(c => c.role === 'user');
        if (lastUserMsg) {
          lastUserMsg.parts.push({ text: "\n\nContext:\n" + fileContext });
        }
        return contents;
      };

      const contents = prepareContents(messages);

      const tryWithFetch = async (id: string, version: string = 'v1beta') => {
        let cleanId = id.toLowerCase().trim();
        // Map to models CONFIRMED available in this account via ListModels
        if (cleanId.includes('2.5 pro') || cleanId.includes('pro')) cleanId = 'gemini-2.5-pro';
        if (cleanId.includes('2.5 flash')) cleanId = 'gemini-2.5-flash';
        if (cleanId.includes('2.0 flash') || cleanId.includes('1.5 flash') || cleanId.includes('flash')) cleanId = 'gemini-2.0-flash';
        if (cleanId.includes('2.0 pro') || cleanId.includes('1.5 pro')) cleanId = 'gemini-2.5-pro';
        if (cleanId.includes('3.1') || cleanId.includes('3.0') || cleanId.includes('3 ')) cleanId = 'gemini-2.5-flash';
        if (!cleanId.startsWith('gemini-')) cleanId = 'gemini-2.0-flash';

        const url = `https://generativelanguage.googleapis.com/${version}/models/${cleanId}:generateContent?key=${key}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 65536,
              temperature: 0.8
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      };

      try {
        return await tryWithFetch(modelName);
      } catch (e: any) {
        const isRateLimit = e.message.includes('429');
        const isKeyError = e.message.includes('400') || e.message.includes('API key not valid');

        if (isRateLimit || isKeyError) {
          logToFile(`[callVertex] Key failed (${isRateLimit ? '429' : '400'}), cooling down 1.5s and trying next key...`);
          await new Promise(r => setTimeout(r, 1500)); // Crucial wait to let quota refresh
          lastError = e;
          continue; 
        }

        let chatRetryCount = 0;
        const totalAttempts = 3; // Increased to 3 for better resilience
        
        while (chatRetryCount < totalAttempts) {
          try {
            // Added 3.1-flash-live as the ultimate "Live" fallback
            const fallbacks = [
              'gemini-2.0-flash',
              'gemini-2.5-flash',
              'gemini-2.0-flash-001',
              'gemini-2.5-pro'
            ];
            for (const fb of fallbacks) {
              if (fb.toLowerCase().includes(modelName.toLowerCase())) continue;
              try { 
                return await tryWithFetch(fb); 
              } catch (inner: any) {
                // If fallback also hits rate limit, don't wait here, try next fallback
                if (inner.message.includes('429')) continue;
              }
            }
            break;
          } catch (retryErr) {
            chatRetryCount++;
            // Exponential backoff
            await new Promise(r => setTimeout(r, 2000 * chatRetryCount));
          }
        }
        throw e;
      }
    } catch (err) {
      lastError = err;
    }
  }

  // --- FINAL FALLBACK: Vertex AI Native REST implementation ---
  try {
    logToFile(`[callVertex] Attempting Native REST Fallback...`);
    const saEnv = process.env.VERTEX_AI_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saEnv) throw new Error("No Service Account found.");
    
    const credentials = parseServiceAccountEnv(saEnv);
    if (!credentials) throw new Error("Invalid Service Account.");

    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({
      credentials,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const accessToken = token.token;

    const project = credentials.project_id || 'roosevelt-491004';
    const location = 'us-central1';
    const modelId = modelName.includes('pro') ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
    
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${modelId}:streamGenerateContent`;

    const prepareVertexContents = (msgs: any[]) => {
      return msgs.map(m => {
        const parts: any[] = [{ text: m.content || "" }];
        if (m.images) {
          m.images.forEach((img: any) => {
            parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
          });
        }
        return { role: m.role === 'ai' || m.role === 'model' ? 'model' : 'user', parts };
      });
    };

    const contents = prepareVertexContents(messages);
    if (contents.length > 0) {
      contents[0].parts.unshift({ text: SYSTEM_PROMPT });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 8192, temperature: 0.8 } })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Vertex REST failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    // Native REST response structure is slightly different (usually an array for streamGenerateContent)
    const text = data[0]?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      logToFile(`[callVertex] Vertex REST Success!`);
      return text;
    }
  } catch (vErr: any) {
    logToFile(`[callVertex] Vertex REST Fallback failed: ${vErr.message}`);
    // DO NOT throw technical errors to the UI anymore. 
    // Instead, return a friendly message if everything failed.
    return "⚠️ Los motores de IA están bajo mucha carga. Por favor, espera 5 segundos y reintenta tu mensaje. ¡Estamos trabajando en ello!";
  }

  throw lastError || new Error("No valid API keys found or all keys failed.");
}


async function agenticFlow(messages: any[], fileContext: string, currentFiles: Record<string, string>, modelName: string = "Gemini 2.0 Pro", apiKeys: string[]) {
  logToFile("[AgenticFlow] Starting Multi-Agent Pipeline...");
  const startTime = Date.now();

  // Stage 1: Architect & Code Generation (with retry for think-only/parse failures)
  let result;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logToFile(`[AgenticFlow] Stage 1: Architecting with ${modelName}... (Attempt ${attempt}/${maxAttempts})`);
      const rawResult = await callVertex(modelName, messages, fileContext, apiKeys);
      result = extractJSON(rawResult, currentFiles);

      // If we got ANY valid result (message or code_update), we stop retrying.
      // Retries are ONLY for cases where the AI returned empty or failed to parse.
      if (result) {
        // If it's a code_update with files, OR any message (including short ones like "Hola"), we are done.
        if (result.type === 'code_update' && result.files?.length > 0) break;
        if (result.type === 'message' && result.content && result.content.trim().length > 0) break;
      }

      if (attempt < maxAttempts) {
        logToFile(`[AgenticFlow] Attempt ${attempt} returned empty or too short. Retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e: any) {
      logToFile(`[AgenticFlow] Stage 1 Failed (Attempt ${attempt}): ${e.message}`);
      
      const isRateLimit = e.message?.includes('429');
      
      if (attempt >= maxAttempts) {
        if (isRateLimit) {
          return { 
            type: "message", 
            content: "⚠️ Límite de peticiones AI excedido en todos los motores (Gemini + Vertex). Por favor, espera 1 minuto y reintenta. Si el problema persiste, es necesario escalar la cuota en Google Cloud." 
          };
        }
        const msg = `AI Architect failure: ${e.message?.substring(0, 150)}... Reintenta en unos segundos.`;
        return { type: "message", content: msg };
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Stage 2 (Visual Polishing) DISABLED for speed — quality rules are now in the main prompt

  logToFile(`[AgenticFlow] Pipeline completed in ${Date.now() - startTime}ms`);
  return result;
}

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
  console.log("--- 🤖 AI REQUEST RECEIVED 🤖 ---");
  
  // Support for multiple keys (rotation)
  const platformKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(',')
    .map(k => k.trim())
    .filter(k => k && k !== "your_gemini_api_key");
    
  let activeKeys = [...platformKeys];
  
  try {
    const { messages, currentFiles, model, supabaseConfig, projectId, userId, entityId } = await req.json();
    const suiteDenied = await requireSuite(userId, entityId, 'cto');
    if (suiteDenied) return suiteDenied;
    logToFile(`[POST] Request started. User: ${userId}, Model: ${model}`);

    // --- CREDITS SYSTEM (Lovable Style) ---
    if (userId) {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      const userData = userDoc.data();
      const userEmail = userData?.email || "";

      // EMERGENCY BYPASS FOR TESTING
      const isAdmin = true; 

      if (!isAdmin) {
        let credits = userDoc.exists ? (userData?.credits ?? -1) : -1;

        // Initialize new users with 10 gift credits
        if (credits === -1) {
          credits = 10;
          await userRef.set({ credits: 10 }, { merge: true });
          logToFile(`[Credits] Initialized 10 gift credits for new user ${userId}`);
        }

        if (credits <= 0) {
          logToFile(`[Credits] User ${userId} blocked: 0 credits.`);
          return NextResponse.json({ 
            type: "message", 
            content: "⚠️ Te has quedado sin créditos. Por favor, recarga tu balance para continuar construyendo con IA." 
          });
        }
      } else {
        logToFile(`[Credits] Admin bypass for ${userEmail}`);
      }
    }
    // ---------------------------------------

    // --- BYOK: Fetch project-specific API Key from Firestore ---
    if (projectId && userId && entityId) {
      try {
        const projectDoc = await db.collection('users').doc(userId).collection('entities').doc(entityId).collection('web-projects').doc(projectId).get();
        if (projectDoc.exists) {
          const projectData = projectDoc.data();
          if (projectData?.geminiApiKey) {
            logToFile(`[POST] Project-specific API Key found for ${projectId}. Adding to active keys.`);
            activeKeys = [projectData.geminiApiKey.trim(), ...activeKeys];
          }
        }
      } catch (e: any) {
        logToFile(`[POST] Failed to fetch project key: ${e.message}`);
      }
    }
    // ------------------------------------------------------------

    const fileEntries = Object.entries(currentFiles || {}) as [string, string][];
    const filteredFiles = fileEntries.filter(([path]) => {
      const isAsset = path.includes('assets/') || path.includes('public/') || path.includes('lovable-uploads/');
      const isCode = path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js') || path.endsWith('.css');
      return isCode || isAsset;
    });

    // Detect project state for progressive generation strategy
    const codeFiles = filteredFiles.filter(([p]) => p.endsWith('.tsx') || p.endsWith('.ts') || p.endsWith('.jsx') || p.endsWith('.js') || p.endsWith('.css'));
    const hasPages = codeFiles.some(([p]) => p.includes('/pages/') || p.includes('/features/'));
    const hasHomePage = codeFiles.some(([p]) => p.toLowerCase().includes('home') || p.toLowerCase().includes('landing'));
    const isFreshProject = codeFiles.length <= 5; // Only boilerplate files exist

    let generationStrategy = `
🚨 CRITICAL RULE: NO DESTRUCTIVE CHANGES 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You must NEVER delete, empty, or break the existing project files when adding new features like Supabase, Firebase, or complex logic.
Modify ONLY the files required for the new feature and KEEP ALL OTHER FILES INTACT.
Returning an empty JSON or emitting destructive changes will instantly crash the project. NEVER do this.
`;
    if (isFreshProject && !hasHomePage) {
      // PHASE 1: Fresh project — generate professional foundation
      generationStrategy = `
🎯 GENERATION STRATEGY: PHASE 1 — PROFESSIONAL FOUNDATION 🎯
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is a BRAND NEW project. To ensure WORLD-CLASS quality (Lovable/V0 style), follow this strategy:

1. USE EXISTING UI COMPONENTS:
   - You MUST use the pre-installed components in 'src/components/ui/' (Button, Card, Input, etc.).
   - NEVER write raw HTML buttons or inputs if a UI component exists.
   - Import them like this: \`import { Button } from "@/components/ui/button"\`.

2. MANDATORY DIRECTORY STRUCTURE:
   - src/index.css — Complete design system with CSS variables.
   - src/lib/utils.ts — Utility for class merging (cn).
   - src/components/ui/ — (Existing) Base UI components.
   - src/features/Layout/Navbar.tsx — Premium sticky navbar.
   - src/features/Layout/Footer.tsx — Rich footer.
   - src/pages/HomePage.tsx — THE MAIN PAGE (Rich, 6+ sections).
   - src/App.tsx — HashRouter setup with proper routing.

3. QUALITY FOCUS:
   - Dedicate 80% of tokens to HomePage.tsx. It MUST be breathtaking.
   - Use 'framer-motion' for all entrances and hover effects.
   - Implement Bento-grids, Glassmorphism, and Premium Gradients.
   - IMAGES: Use ONLY the verified Unsplash URLs provided in the context.

4. RESPONSE BREVITY:
   - The "content" field in JSON must be 2-3 lines max.
`;
      logToFile(`[POST] Progressive Gen: PHASE 1 — Professional Foundation (${codeFiles.length} code files)`);
    } else if (hasHomePage && hasPages) {
      // PHASE 2+: Project has pages — follow established design
      generationStrategy = `
🎯 GENERATION STRATEGY: FOLLOW ESTABLISHED DESIGN 🎯
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This project ALREADY has an established design. When generating new pages or modifying existing ones:

1. DESIGN CONSISTENCY:
   - Extract the color palette, typography, and spacing from the existing globals.css and components
   - New pages MUST match the visual quality and style of the existing HomePage
   - Use the SAME animation patterns, glassmorphism level, and layout approach as existing pages
   - Reuse the existing Navbar and Footer components
   - MANDATORY: Use NAMED EXPORTS for all new components (e.g., \`export const NewPage = ...\`). NEVER use \`export default\`.
   - ZUSTAND STORES: Use \`export const useStore = create(...)\`. NEVER use \`export default\`.

2. SINGLE PAGE FOCUS:
   - If the user asks for a new page, generate ONLY that one page file
   - Make the new page just as rich and detailed as the HomePage (6+ sections minimum)
   - Update App.tsx routes to include the new page (replace ComingSoonPage if applicable)

3. IMAGE RULES:
   - ONLY use URLs from the VERIFIED list provided in the existing files, or use https://picsum.photos/800/600 as fallback
   - NEVER invent Unsplash photo IDs — only use IDs already present in the project's code
   - NEVER reference local /assets/ paths unless those files already exist in the project

4. CRITICAL UTILS RULE:
   - src/lib/utils.ts ONLY exports "cn()". NEVER import anything else from it.
   - NEVER import generateUniqueId, generateId, uuid, or similar. Use crypto.randomUUID() inline.

5. RESPONSE BREVITY:
   - The "content" field MUST be 2-3 lines max. Do NOT list every file — the UI shows them automatically.
`;
      logToFile(`[POST] Progressive Gen: PHASE 2+ — Follow design (${codeFiles.length} code files, hasPages=${hasPages})`);
    }

    if (supabaseConfig?.url && supabaseConfig?.key) {
      generationStrategy += `
🚨 MANDATORY SUPABASE CONFIGURATION 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The user has enabled Supabase. You MUST create/update these EXACT files:

1. \`.env\` (at the root):
VITE_SUPABASE_URL=${supabaseConfig.url}
VITE_SUPABASE_ANON_KEY=${supabaseConfig.key}

2. \`src/lib/supabase.ts\`:
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

NEVER use placeholders like 'your-project-url'. Use the exact values provided above.
`;
      logToFile(`[POST] Injected Supabase Config for AI.`);
    }

    if (userId && entityId && projectId) {
      generationStrategy += `
🚨 STRICT FIRESTORE MULTI-TENANT ARCHITECTURE 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If you need to use Firebase Firestore to store data (like web forms, leads), you MUST ALWAYS use this EXACT path structure:
\`collection(db, "users", "${userId}", "entities", "${entityId}", "web-projects", "${projectId}", "[YOUR_COLLECTION_NAME]")\`
 NEVER use a root-level collection like "contacts" or "web-projects".
`;
      logToFile(`[POST] Injected Multi-Tenant DB Config for AI.`);
    }

    // --- CONTEXT OPTIMIZATION (Tokens & Rate Limit Protection) ---
    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";
    const isCodeRequest = lastUserMessage.length > 20 || 
                         /\b(crea|modifica|cambia|agrega|fix|error|página|componente|estilo|css|ts|js|jsx|tsx)\b/i.test(lastUserMessage) ||
                         currentFiles && Object.keys(currentFiles).length === 0; // Always send for empty projects to get boilerplate

    let fileContext = "";
    if (isCodeRequest) {
      fileContext = filteredFiles.length > 0 ? "\n\nCONTEXT:\n" + filteredFiles
        .map(([p, c]) => {
          if (p.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
            return `--- FILE: ${p} --- [IMAGE ASSET AVAILABLE]`;
          }
          return `--- FILE: ${p} ---\n${c}\n`;
        }).join("\n").substring(0, 100000) : "";

      // Prepend generation strategy to context
      if (generationStrategy) {
        fileContext = "\n\n" + generationStrategy + fileContext;
      }
      logToFile(`[Context] Sending full project context (${fileContext.length} chars).`);
    } else {
      logToFile(`[Context] Skipping full context for simple chat message.`);
      fileContext = "\n\n(Contexto de archivos omitido para esta consulta simple para ahorrar tokens. Si el usuario pide cambios en el código, el contexto se incluirá automáticamente.)";
    }

    // --- MODEL OPTIMIZATION (Use Flash for simple chat to save Pro/Thinking quota) ---
    let activeModel = model || "Gemini 2.0 Flash";
    if (!isCodeRequest && (activeModel.includes("2.0") || activeModel.includes("Pro"))) {
      logToFile(`[Model] Using Flash for simple query to save higher-tier quota.`);
      activeModel = "Gemini 2.0 Flash";
    }

    // ALL requests now use the Agentic Flow (Architect + Refiner) to ensure quality
    // We pass the activeKeys array here
    let finalResult = await agenticFlow(messages, fileContext, currentFiles || {}, activeModel, activeKeys);

    // SANITY CHECK: Block AI responses that attempt to wipe out the project by returning an empty files array
    // ONLY block if it's a code_update (plans and questions are fine)
    if (finalResult && finalResult.type === 'code_update' && (!finalResult.files || finalResult.files.length === 0)) {
       logToFile("[POST] SANITY CHECK FAILED: AI returned code_update with no files! Blocking response to protect project.");
       return NextResponse.json({ type: "message", content: "Error de seguridad: La IA generó una respuesta inválida (sin código). Por favor, intenta de nuevo con instrucciones más detalladas." });
    }

    // --- DEDUCT CREDIT ON SUCCESS ---
    if (userId && finalResult) {
      try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userEmail = userDoc.data()?.email || "";
        
        if (userEmail !== "admluxorsys@gmail.com") {
          await userRef.update({
            credits: admin.firestore.FieldValue.increment(-1)
          });
          logToFile(`[Credits] Deducted 1 credit from ${userId}. Interaction complete.`);
        } else {
          logToFile(`[Credits] Admin ${userEmail} used AI - No deduction.`);
        }
      } catch (err: any) {
        logToFile(`[Credits] Failed to deduct credit: ${err.message}`);
      }
    }
    // --------------------------------

    logToFile(`[POST] Returning successful code update with ${finalResult?.files?.length ?? 'N/A'} files.`);
    return NextResponse.json(finalResult ?? { type: 'message', content: 'Error interno: respuesta vacía del modelo.' });

  } catch (e: any) {
    logToFile(`[Vertex API Error] ${e.message}`);
    let userMsg = "Error: " + e.message;
    if (e.message?.includes('API key not valid') || e.message?.includes('400')) {
      userMsg = "🚨 Tu API Key de Gemini no es válida o ha expirado. Por favor, ve a 'Configuración' (botón de engranaje) y actualízala para este proyecto.";
    }
    return NextResponse.json({ type: "message", content: userMsg }, { status: 200 }); // Status 200 so the UI displays it as a message
  }
}

