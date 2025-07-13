# Internationalization (i18n) Implementation Guide

This document provides a comprehensive overview of the internationalization system implemented for the ADLP (API-Driven Launch Platform) SvelteKit application.

## Overview

The i18n system provides:
- Support for 4 languages: English (default), Spanish, French, and German
- URL-based language routing (e.g., `/en/`, `/es/`, `/fr/`, `/de/`)
- Browser language detection with localStorage persistence
- Language switching UI components
- Comprehensive formatting utilities for dates, numbers, and currencies
- RTL support foundation for future Arabic/Hebrew support
- Production-ready with proper fallbacks and efficient loading

## Architecture

### Core Components

1. **i18n Core (`src/lib/i18n/index.js`)**
   - Language validation and detection
   - URL path manipulation
   - Browser language detection
   - localStorage persistence

2. **Translation Files (`src/lib/i18n/locales/`)**
   - `en.json` - English (default)
   - `es.json` - Spanish
   - `fr.json` - French
   - `de.json` - German

3. **Formatters (`src/lib/i18n/formatters.js`)**
   - Date/time formatting
   - Number and currency formatting
   - File size and duration formatting
   - List formatting with locale-aware conjunctions

4. **Language Switcher (`src/lib/components/LanguageSwitcher.svelte`)**
   - Multiple variants: dropdown, buttons, select
   - Configurable flags and labels
   - Responsive design with RTL support

5. **SvelteKit Integration**
   - Server hooks (`src/hooks.server.js`)
   - Client hooks (`src/hooks.client.js`)
   - Layout integration (`src/routes/+layout.svelte`)

## Supported Languages

| Code | Language | Native Name | Flag | Direction |
|------|----------|-------------|------|-----------|
| `en` | English  | English     | 🇺🇸   | LTR       |
| `es` | Spanish  | Español     | 🇪🇸   | LTR       |
| `fr` | French   | Français    | 🇫🇷   | LTR       |
| `de` | German   | Deutsch     | 🇩🇪   | LTR       |

## URL Structure

The application supports both localized and non-localized URLs:

- **Default (English)**: `/`, `/submit`, `/launches`
- **Localized**: `/es/`, `/es/submit`, `/fr/launches`, `/de/dashboard`

### URL Routing Logic

1. **No locale in URL**: Detect from browser language or localStorage
2. **Invalid locale**: Redirect to valid locale or default
3. **Valid locale**: Set in server locals and client store

## Usage Examples

### Basic Translation

```svelte
<script>
  import { _ } from 'svelte-i18n';
</script>

<h1>{$_('home.hero.title')}</h1>
<p>{$_('home.hero.description')}</p>
```

### Translation with Variables

```svelte
<script>
  import { _ } from 'svelte-i18n';
</script>

<p>{$_('language.current', { values: { language: 'English' } })}</p>
```

### Date Formatting

```svelte
<script>
  import { formatDate, formatRelativeTime } from '$lib/i18n/formatters.js';
</script>

<p>Created: {formatDate(new Date())}</p>
<p>Last updated: {formatRelativeTime(lastUpdate)}</p>
```

### Language Switcher

```svelte
<script>
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
</script>

<!-- Dropdown variant -->
<LanguageSwitcher variant="dropdown" showFlags={true} showLabels={false} />

<!-- Button variant -->
<LanguageSwitcher variant="buttons" showFlags={true} showLabels={true} />

<!-- Select variant -->
<LanguageSwitcher variant="select" showFlags={true} showLabels={true} />
```

## Translation File Structure

Translation files use nested JSON structure for organization:

```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "navigation": {
    "home": "Home",
    "launches": "Launches",
    "submit": "Submit"
  },
  "home": {
    "hero": {
      "title": "Launch Your Product",
      "description": "Join our platform..."
    }
  }
}
```

## Formatting Utilities

### Date and Time

```javascript
import { formatDate, formatTime, formatDateTime, formatRelativeTime } from '$lib/i18n/formatters.js';

// Format date
formatDate(new Date()); // "January 15, 2024"

// Format time
formatTime(new Date()); // "2:30 PM"

// Format date and time
formatDateTime(new Date()); // "Jan 15, 2024, 2:30 PM"

// Relative time
formatRelativeTime(new Date(Date.now() - 3600000)); // "1 hour ago"
```

### Numbers and Currency

```javascript
import { formatNumber, formatCurrency, formatPercent } from '$lib/i18n/formatters.js';

// Format number
formatNumber(1234.56); // "1,234.56"

// Format currency
formatCurrency(1234.56, 'USD'); // "$1,234.56"

// Format percentage
formatPercent(0.1234); // "12.3%"
```

### File Sizes and Durations

```javascript
import { formatFileSize, formatDuration } from '$lib/i18n/formatters.js';

// Format file size
formatFileSize(1024 * 1024); // "1 MB"

// Format duration
formatDuration(3661000); // "1 hour and 1 minute"
formatDuration(3661000, { short: true }); // "1h 1m"
```

## Server-Side Integration

### Hooks Configuration

The server hooks handle:
- Language detection from URL path
- Browser language detection from Accept-Language header
- Automatic redirects for invalid locales
- Setting locale in server locals

### Layout Integration

The root layout:
- Initializes i18n system on client
- Sets document language and direction attributes
- Provides locale data to all pages

## Client-Side Features

### Language Detection Priority

1. **URL path locale** (highest priority)
2. **localStorage saved locale**
3. **Browser Accept-Language header**
4. **Default locale** (fallback)

### Persistence

- Language preference saved to localStorage
- Document attributes updated automatically
- Seamless switching without page reload

## RTL Support Foundation

The system includes RTL support infrastructure:

```javascript
import { getTextDirection, isRTL } from '$lib/i18n/formatters.js';

// Get text direction
const direction = getTextDirection(); // 'ltr' or 'rtl'

// Check if RTL
const isRightToLeft = isRTL(); // boolean
```

CSS classes and document attributes are automatically set for RTL languages.

## Testing

Comprehensive test suites cover:

### Core Functions (`test/i18n/i18n-core.test.js`)
- Locale validation
- Path detection and manipulation
- Browser language detection
- URL routing logic

### Formatters (`test/i18n/formatters.test.js`)
- Date/time formatting
- Number/currency formatting
- File size and duration formatting
- RTL detection

### Running Tests

```bash
# Run all i18n tests
pnpm test test/i18n/

# Run specific test file
pnpm test test/i18n/i18n-core.test.js

# Run with coverage
pnpm test:coverage test/i18n/
```

## Performance Considerations

### Efficient Loading
- Translation files loaded on-demand
- Lazy loading of non-default locales
- Minimal bundle size impact

### Caching
- Browser caching of translation files
- localStorage persistence reduces API calls
- Server-side locale detection minimizes redirects

### Bundle Optimization
- Tree-shaking of unused translations
- Separate chunks for each locale
- Minimal runtime overhead

## Adding New Languages

To add a new language (e.g., Italian):

1. **Add to supported locales**:
```javascript
// src/lib/i18n/index.js
export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de', 'it'];

export const LOCALE_METADATA = {
  // ... existing locales
  it: {
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    dir: 'ltr'
  }
};
```

2. **Create translation file**:
```bash
# Copy English translations as template
cp src/lib/i18n/locales/en.json src/lib/i18n/locales/it.json
# Translate all strings to Italian
```

3. **Update tests**:
```javascript
// Add Italian to test cases
expect(SUPPORTED_LOCALES).to.include('it');
```

## Best Practices

### Translation Keys
- Use descriptive, hierarchical keys
- Group related translations
- Avoid deeply nested structures (max 3 levels)

### Pluralization
- Use ICU message format for complex plurals
- Handle zero, one, and many cases
- Consider language-specific plural rules

### Context
- Provide context for translators
- Use comments in translation files
- Include examples for complex formatting

### Performance
- Lazy load non-critical translations
- Use translation keys consistently
- Avoid inline translations

## Troubleshooting

### Common Issues

1. **Missing translations**: Check console for missing key warnings
2. **Locale not switching**: Verify localStorage and URL structure
3. **Formatting errors**: Check locale-specific Intl API support
4. **RTL layout issues**: Ensure CSS supports direction changes

### Debug Mode

Enable debug logging:
```javascript
// Add to app initialization
if (import.meta.env.DEV) {
  console.log('Current locale:', getCurrentLocale());
  console.log('Supported locales:', SUPPORTED_LOCALES);
}
```

## Future Enhancements

### Planned Features
- Arabic and Hebrew RTL language support
- Pluralization with ICU message format
- Translation management interface
- Automatic translation validation
- Performance monitoring and analytics

### Extensibility
- Plugin system for custom formatters
- Dynamic locale loading
- Translation memory integration
- Automated translation workflows

## Conclusion

This i18n implementation provides a robust, scalable foundation for multilingual support in the ADLP application. The system is designed for production use with proper fallbacks, efficient loading, and comprehensive testing coverage.

For questions or contributions, please refer to the project documentation or create an issue in the repository.