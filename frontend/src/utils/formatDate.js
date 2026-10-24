/**
 * Safely parses any server UTC datetime string (with or without 'Z')
 * and converts it to the user's local browser timezone.
 */
export function parseUtcDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;

  let str = String(dateStr).trim();
  // If the ISO string lacks timezone indicator ('Z' or '+00:00' / '-05:00'),
  // append 'Z' so JavaScript correctly parses it as UTC instead of local time.
  if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  return new Date(str);
}

/**
 * Returns formatted time in the user's local browser timezone (e.g. "07:15 PM").
 */
export function formatLocalTime(dateStr, options = { hour: '2-digit', minute: '2-digit' }) {
  try {
    return parseUtcDate(dateStr).toLocaleTimeString([], options);
  } catch {
    return '';
  }
}

/**
 * Returns formatted date in the user's local browser timezone (e.g. "10/24/2026").
 */
export function formatLocalDate(dateStr, options = undefined) {
  try {
    return parseUtcDate(dateStr).toLocaleDateString([], options);
  } catch {
    return '';
  }
}

/**
 * Returns combined date and time in the user's local browser timezone.
 */
export function formatLocalDateTime(dateStr) {
  try {
    const d = parseUtcDate(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}
