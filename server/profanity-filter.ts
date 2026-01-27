/**
 * Username and display name validation with basic profanity filtering
 */

interface ValidationResult {
  valid: boolean;
  message?: string;
}

// Basic profanity word list (can be expanded)
const PROFANITY_WORDS = new Set([
  // Add words as needed - keeping minimal for now
]);

/**
 * Check if a string contains profanity
 */
function containsProfanity(text: string): boolean {
  const lowerText = text.toLowerCase();
  for (const word of PROFANITY_WORDS) {
    if (lowerText.includes(word.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Validate username
 * Rules:
 * - 3-20 characters
 * - Alphanumeric, underscores, and hyphens only
 * - No profanity
 */
export function validateUsername(username: string): ValidationResult {
  if (!username || typeof username !== 'string') {
    return { valid: false, message: "Username is required" };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { valid: false, message: "Username must be at least 3 characters" };
  }

  if (trimmed.length > 20) {
    return { valid: false, message: "Username must be 20 characters or less" };
  }

  // Only alphanumeric, underscores, and hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, message: "Username can only contain letters, numbers, underscores, and hyphens" };
  }

  // Check for profanity
  if (containsProfanity(trimmed)) {
    return { valid: false, message: "Username contains inappropriate content" };
  }

  return { valid: true };
}

/**
 * Validate display name (first or last name)
 * Rules:
 * - 1-50 characters
 * - Letters, spaces, hyphens, and apostrophes only
 * - No profanity
 */
export function validateDisplayName(name: string): ValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, message: "Name is required" };
  }

  const trimmed = name.trim();

  if (trimmed.length < 1) {
    return { valid: false, message: "Name cannot be empty" };
  }

  if (trimmed.length > 50) {
    return { valid: false, message: "Name must be 50 characters or less" };
  }

  // Letters, spaces, hyphens, and apostrophes only
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
    return { valid: false, message: "Name can only contain letters, spaces, hyphens, and apostrophes" };
  }

  // Check for profanity
  if (containsProfanity(trimmed)) {
    return { valid: false, message: "Name contains inappropriate content" };
  }

  return { valid: true };
}
