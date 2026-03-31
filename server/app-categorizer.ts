// App Categorization Service
// Categorizes apps as distracting, productive, or neutral using AI

import { db } from './db';
import { appCategories, userAppRules } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export type AppCategoryType = 'distracting' | 'productive' | 'neutral';

// Default categorizations for common apps (no AI needed)
const DEFAULT_CATEGORIES: Record<string, AppCategoryType> = {
  // Distracting - Social Media
  'discord': 'distracting',
  'slack': 'distracting',
  'telegram': 'distracting',
  'whatsapp': 'distracting',
  'messenger': 'distracting',
  'signal': 'distracting',
  'wechat': 'distracting',
  'line': 'distracting',
  'skype': 'distracting',
  
  // Distracting - Entertainment
  'youtube': 'distracting',
  'netflix': 'distracting',
  'spotify': 'distracting',
  'twitch': 'distracting',
  'hulu': 'distracting',
  'disney+': 'distracting',
  'prime video': 'distracting',
  'vlc': 'distracting',
  'plex': 'distracting',
  'music': 'distracting',
  'tv': 'distracting',
  'podcasts': 'distracting',
  
  // Distracting - Social
  'twitter': 'distracting',
  'x': 'distracting',
  'facebook': 'distracting',
  'instagram': 'distracting',
  'tiktok': 'distracting',
  'snapchat': 'distracting',
  'reddit': 'distracting',
  'tumblr': 'distracting',
  'pinterest': 'distracting',
  'linkedin': 'distracting',
  
  // Distracting - Games
  'steam': 'distracting',
  'epic games': 'distracting',
  'minecraft': 'distracting',
  'fortnite': 'distracting',
  'league of legends': 'distracting',
  'valorant': 'distracting',
  'overwatch': 'distracting',
  'roblox': 'distracting',
  'chess': 'distracting',
  'solitaire': 'distracting',
  
  // Distracting - News/Time wasters
  'news': 'distracting',
  'buzzfeed': 'distracting',
  '9gag': 'distracting',
  'imgur': 'distracting',
  
  // Distracting - Gaming websites
  'freegames': 'distracting',
  'freegames.com': 'distracting',
  'miniclip': 'distracting',
  'miniclip.com': 'distracting',
  'kongregate': 'distracting',
  'kongregate.com': 'distracting',
  'poki': 'distracting',
  'poki.com': 'distracting',
  'coolmathgames': 'distracting',
  'coolmathgames.com': 'distracting',
  'crazygames': 'distracting',
  'crazygames.com': 'distracting',
  'armor games': 'distracting',
  'armorgames.com': 'distracting',
  'newgrounds': 'distracting',
  'newgrounds.com': 'distracting',
  'itch.io': 'distracting',
  'games': 'distracting',
  
  // Productive - Development
  'visual studio code': 'productive',
  'code': 'productive',
  'vscode': 'productive',
  'cursor': 'productive',
  'xcode': 'productive',
  'android studio': 'productive',
  'intellij': 'productive',
  'webstorm': 'productive',
  'pycharm': 'productive',
  'sublime text': 'productive',
  'atom': 'productive',
  'vim': 'productive',
  'neovim': 'productive',
  'emacs': 'productive',
  'terminal': 'productive',
  'iterm': 'productive',
  'iterm2': 'productive',
  'warp': 'productive',
  'hyper': 'productive',
  'github desktop': 'productive',
  'sourcetree': 'productive',
  'docker': 'productive',
  'postman': 'productive',
  'insomnia': 'productive',
  
  // Productive - Office/Productivity
  'microsoft word': 'productive',
  'word': 'productive',
  'microsoft excel': 'productive',
  'excel': 'productive',
  'microsoft powerpoint': 'productive',
  'powerpoint': 'productive',
  'google docs': 'productive',
  'google sheets': 'productive',
  'google slides': 'productive',
  'notion': 'productive',
  'obsidian': 'productive',
  'evernote': 'productive',
  'onenote': 'productive',
  'bear': 'productive',
  'notes': 'productive',
  'pages': 'productive',
  'numbers': 'productive',
  'keynote': 'productive',
  'figma': 'productive',
  'sketch': 'productive',
  'adobe xd': 'productive',
  'photoshop': 'productive',
  'illustrator': 'productive',
  'premiere': 'productive',
  'after effects': 'productive',
  'blender': 'productive',
  'final cut': 'productive',
  'logic pro': 'productive',
  'garageband': 'productive',
  
  // Productive - Communication (work)
  'zoom': 'productive',
  'microsoft teams': 'productive',
  'teams': 'productive',
  'google meet': 'productive',
  'webex': 'productive',
  
  // Productive - Browsers (neutral by default, but mark productive for work)
  'safari': 'neutral',
  'google chrome': 'neutral',
  'chrome': 'neutral',
  'firefox': 'neutral',
  'edge': 'neutral',
  'brave': 'neutral',
  'arc': 'neutral',
  'opera': 'neutral',
  
  // Neutral - System
  'finder': 'neutral',
  'file explorer': 'neutral',
  'system preferences': 'neutral',
  'settings': 'neutral',
  'activity monitor': 'neutral',
  'task manager': 'neutral',
  'calculator': 'neutral',
  'preview': 'neutral',
  'photos': 'neutral',
  'calendar': 'neutral',
  'mail': 'neutral',
  'messages': 'neutral',
  'facetime': 'neutral',
  
  // Flowlocked itself - always neutral
  'flowlocked': 'neutral',
  'focustogether': 'neutral',
};

// In-memory cache for categorizations (reduces DB queries)
const categoryCache: Map<string, AppCategoryType> = new Map();

// Initialize cache with defaults
for (const [app, category] of Object.entries(DEFAULT_CATEGORIES)) {
  categoryCache.set(app.toLowerCase(), category);
}

/**
 * Normalize app name for consistent lookups
 */
function normalizeAppName(appName: string): string {
  let n = appName.toLowerCase().trim();
  // macOS sometimes reports active apps as "Chess.app" / "Steam.app".
  // Strip the suffix so our default category keys like "chess" and "steam" match.
  if (n.endsWith(".app")) {
    n = n.slice(0, -4).trim();
  }
  return n;
}

function stripWwwHostname(hostname: string): string {
  const h = hostname.trim().toLowerCase();
  return h.startsWith('www.') ? h.slice(4) : h;
}

/** Rough check: value looks like a URL hostname (extension reports these), not "Google Chrome". */
function looksLikeHostname(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n.includes('.') || n.includes(' ')) return false;
  if (n.endsWith('.app')) return false;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(n) || n === 'localhost';
}

/**
 * Keys to classify so www.youtube.com / m.youtube.com resolve to the same rules as "youtube".
 * Order: prefer main domain label before full host (hits DEFAULT_CATEGORIES without AI).
 */
function domainCategoryLookupKeys(hostname: string): string[] {
  const h = stripWwwHostname(hostname);
  const parts = h.split('.').filter((p) => p.length > 0);
  if (parts.length < 2) {
    return [h];
  }

  const ordered: string[] = [];
  const tld = parts[parts.length - 1];

  if (tld === 'uk' && parts.length >= 3 && parts[parts.length - 2] === 'co') {
    ordered.push(parts[parts.length - 3]);
  } else {
    ordered.push(parts[parts.length - 2]);
  }

  const first = parts[0];
  if (first && first !== ordered[0]) {
    ordered.push(first);
  }
  ordered.push(h);

  return [...new Set(ordered)];
}

/**
 * Keywords that indicate distracting content (for domains/apps not in the list)
 */
const DISTRACTING_KEYWORDS = [
  'game', 'games', 'gaming', 'play',
  'porn', 'xxx', 'adult', 'nsfw',
  'casino', 'gambling', 'bet', 'slots', 'poker',
  'meme', 'funny', 'humor', 'lol',
  'stream', 'watch', 'movie', 'movies', 'tv', 'show', 'shows',
  'anime', 'manga', 'comic',
  'dating', 'tinder', 'bumble', 'hinge',
];

/**
 * Check if a name contains distracting keywords
 */
function hasDistractingKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return DISTRACTING_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Get category for an app from cache, database, keywords, or AI
 */
export async function getAppCategory(appName: string): Promise<AppCategoryType> {
  const normalized = normalizeAppName(appName);
  
  // Check memory cache first
  if (categoryCache.has(normalized)) {
    return categoryCache.get(normalized)!;
  }
  
  // Check database cache
  try {
    const dbResult = await db.select()
      .from(appCategories)
      .where(eq(appCategories.appName, normalized))
      .limit(1);
    
    if (dbResult.length > 0) {
      const category = dbResult[0].category as AppCategoryType;
      categoryCache.set(normalized, category);
      return category;
    }
  } catch (error) {
    console.error('[AppCategorizer] Database error:', error);
  }
  
  // Check for distracting keywords (fast check before AI)
  if (hasDistractingKeyword(normalized)) {
    console.log(`[AppCategorizer] "${appName}" contains distracting keyword, marking as distracting`);
    categoryCache.set(normalized, 'distracting');
    // Cache in database too
    try {
      await db.insert(appCategories).values({
        appName: normalized,
        category: 'distracting',
        source: 'keyword',
      }).onConflictDoNothing();
    } catch (error) {
      console.error('[AppCategorizer] Failed to cache keyword category:', error);
    }
    return 'distracting';
  }
  
  // Not found - categorize with AI
  const category = await categorizeWithAI(appName);
  
  // Cache in database
  try {
    await db.insert(appCategories).values({
      appName: normalized,
      category: category,
      source: 'ai',
    }).onConflictDoNothing();
  } catch (error) {
    console.error('[AppCategorizer] Failed to cache category:', error);
  }
  
  // Cache in memory
  categoryCache.set(normalized, category);
  
  return category;
}

/**
 * Use AI (OpenAI) to categorize an unknown app
 */
async function categorizeWithAI(appName: string): Promise<AppCategoryType> {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    console.log(`[AppCategorizer] No OpenAI key, defaulting ${appName} to neutral`);
    return 'neutral';
  }
  
  try {
    console.log(`[AppCategorizer] Categorizing "${appName}" with AI...`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a productivity categorization assistant. Categorize apps/software into exactly one of three categories:
- "distracting": Social media, games, entertainment, streaming, news/media consumption
- "productive": Work tools, development, design, writing, business software
- "neutral": System utilities, browsers, file managers, or apps that could go either way

Respond with ONLY the category word, nothing else.`
          },
          {
            role: 'user',
            content: `Categorize this app: "${appName}"`
          }
        ],
        max_tokens: 10,
        temperature: 0,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.toLowerCase().trim();
    
    if (result === 'distracting' || result === 'productive' || result === 'neutral') {
      console.log(`[AppCategorizer] AI categorized "${appName}" as ${result}`);
      return result;
    }
    
    console.log(`[AppCategorizer] AI returned unexpected: "${result}", defaulting to neutral`);
    return 'neutral';
  } catch (error) {
    console.error(`[AppCategorizer] AI categorization failed for "${appName}":`, error);
    return 'neutral';
  }
}

/**
 * Get list of distracting apps for a user (with their overrides applied)
 */
export async function getDistractingAppsForUser(userId?: string): Promise<string[]> {
  // Start with all known distracting apps from defaults
  const distractingApps = new Set<string>();
  
  for (const [app, category] of Object.entries(DEFAULT_CATEGORIES)) {
    if (category === 'distracting') {
      distractingApps.add(app.toLowerCase());
    }
  }
  
  // Add distracting apps from database cache
  try {
    const dbCategories = await db.select()
      .from(appCategories)
      .where(eq(appCategories.category, 'distracting'));
    
    for (const row of dbCategories) {
      distractingApps.add(row.appName.toLowerCase());
    }
  } catch (error) {
    console.error('[AppCategorizer] Failed to get DB categories:', error);
  }
  
  // Apply user-specific overrides if userId provided
  if (userId) {
    try {
      const userRules = await db.select()
        .from(userAppRules)
        .where(eq(userAppRules.userId, userId));
      
      for (const rule of userRules) {
        const appName = rule.appName.toLowerCase();
        if (rule.rule === 'allowed') {
          // User marked as allowed - remove from distracting
          distractingApps.delete(appName);
        } else if (rule.rule === 'blocked') {
          // User marked as blocked - add to distracting
          distractingApps.add(appName);
        }
      }
    } catch (error) {
      console.error('[AppCategorizer] Failed to get user rules:', error);
    }
  }
  
  return Array.from(distractingApps);
}

/**
 * Get user's allowed apps list
 */
export async function getAllowedAppsForUser(userId: string): Promise<string[]> {
  try {
    const rules = await db.select()
      .from(userAppRules)
      .where(and(
        eq(userAppRules.userId, userId),
        eq(userAppRules.rule, 'allowed')
      ));
    
    return rules.map(r => r.appName);
  } catch (error) {
    console.error('[AppCategorizer] Failed to get allowed apps:', error);
    return [];
  }
}

/**
 * Set a user's app rule (allowed or blocked)
 */
export async function setUserAppRule(
  userId: string, 
  appName: string, 
  rule: 'allowed' | 'blocked'
): Promise<void> {
  const normalized = normalizeAppName(appName);
  
  try {
    await db.insert(userAppRules)
      .values({
        userId,
        appName: normalized,
        rule,
      })
      .onConflictDoUpdate({
        target: [userAppRules.userId, userAppRules.appName],
        set: { rule },
      });
    
    console.log(`[AppCategorizer] Set ${appName} to ${rule} for user ${userId}`);
  } catch (error) {
    console.error('[AppCategorizer] Failed to set user rule:', error);
    throw error;
  }
}

/**
 * Remove a user's app rule
 */
export async function removeUserAppRule(userId: string, appName: string): Promise<void> {
  const normalized = normalizeAppName(appName);
  
  try {
    await db.delete(userAppRules)
      .where(and(
        eq(userAppRules.userId, userId),
        eq(userAppRules.appName, normalized)
      ));
    
    console.log(`[AppCategorizer] Removed rule for ${appName} for user ${userId}`);
  } catch (error) {
    console.error('[AppCategorizer] Failed to remove user rule:', error);
    throw error;
  }
}

/**
 * Categorize an app and check if it's distracting for a user
 */
export async function isAppDistractingForUser(
  appName: string, 
  userId?: string
): Promise<boolean> {
  const normalized = normalizeAppName(appName);
  
  // Check user-specific override first
  if (userId) {
    try {
      const userRule = await db.select()
        .from(userAppRules)
        .where(and(
          eq(userAppRules.userId, userId),
          eq(userAppRules.appName, normalized)
        ))
        .limit(1);
      
      if (userRule.length > 0) {
        return userRule[0].rule === 'blocked';
      }
    } catch (error) {
      console.error('[AppCategorizer] Failed to check user rule:', error);
    }
  }
  
  // Fall back to general category (try hostname-derived keys first so youtube.com → youtube)
  const keysToClassify = looksLikeHostname(normalized)
    ? domainCategoryLookupKeys(normalized)
    : [normalized];

  for (const key of keysToClassify) {
    const category = await getAppCategory(key);
    if (category === 'distracting') {
      return true;
    }
  }
  return false;
}
