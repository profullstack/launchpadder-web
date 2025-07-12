# API-Driven Launch Platform (ADLP)

A federated, API-driven launch platform similar to Product Hunt, built with SvelteKit 2, Supabase, and modern web technologies. The platform enables frictionless URL submission with automated metadata scraping, AI-generated descriptions, and federated submissions across multiple directories.

## 🚀 Features

- **Frictionless URL Submission**: Simple URL input with automated metadata extraction
- **Enhanced Metadata Scraping**: Advanced web scraping with fallback mechanisms for malformed HTML
- **AI-Generated Descriptions**: Intelligent content rewriting using OpenAI API
- **Comprehensive AI Analysis**: Advanced content analysis, SEO optimization, sentiment analysis, and category detection
- **Federated Submissions**: Automatic submission to multiple launch directories
- **Real-time Processing**: Live updates and status tracking
- **Monetization Ready**: Built-in payment integration for submission fees
- **Moderation System**: Content approval and quality control workflows

## 🛠 Tech Stack

### Frontend
- **SvelteKit 2** - Full-stack web framework
- **Svelte 4** - Reactive UI components
- **Vite** - Build tool and development server

### Backend
- **Supabase Cloud** - Backend-as-a-Service (PostgreSQL + Auth + Storage)
- **Node.js 20+** - Server-side runtime
- **ESM Modules** - Modern JavaScript module system

### AI & External Services
- **OpenAI API** - Content rewriting and enhancement
- **Ollama** - Local AI model support (optional)

### Testing & Quality
- **Mocha + Chai** - Test framework and assertions
- **ESLint + Prettier** - Code linting and formatting
- **Nock** - HTTP mocking for tests
- **Puppeteer** - Browser automation for JavaScript-rendered content

## 📁 Project Structure

```
├── src/
│   ├── lib/
│   │   ├── services/           # Core business logic
│   │   │   ├── metadata-fetcher.js         # Base metadata extraction
│   │   │   ├── enhanced-metadata-fetcher.js # Advanced metadata scraping
│   │   │   ├── puppeteer-metadata-fetcher.js # JavaScript-rendered content
│   │   │   ├── ai-rewriter.js              # OpenAI integration
│   │   │   ├── enhanced-ai-service.js      # Comprehensive AI analysis
│   │   │   └── submission-service.js       # Complete submission workflow
│   │   └── config/
│   │       └── supabase.js     # Database configuration
│   ├── routes/
│   │   ├── api/
│   │   │   └── submissions/    # API endpoints
│   │   └── +page.svelte        # Main application page
│   └── app.html                # HTML template
├── test/                       # Test suites
├── supabase/
│   └── migrations/             # Database schema
└── docs/                       # Documentation
```

## 🔧 Installation

### Prerequisites
- Node.js 20 or newer
- pnpm (recommended) or npm
- Supabase account

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd launchpadder-web
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Configure the following environment variables:
   ```env
   # Supabase
   PUBLIC_SUPABASE_URL=your_supabase_url
   PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # OpenAI (optional)
   OPENAI_API_KEY=your_openai_api_key
   
   # Application
   NODE_ENV=development
   ```

4. **Database Setup**
   ```bash
   # Run Supabase migrations
   npx supabase db push
   ```

5. **Start Development Server**
   ```bash
   pnpm dev
   ```

## 🧪 Testing

Run the complete test suite:
```bash
pnpm test
```

Run specific test suites:
```bash
# Enhanced metadata fetcher tests
pnpm test -- --grep "EnhancedMetadataFetcher"

# Submission service tests
pnpm test -- --grep "SubmissionService"

# AI rewriter tests
pnpm test -- --grep "AIRewriter"

# Enhanced AI Service tests
pnpm test -- --grep "EnhancedAIService"

# Enhanced AI Integration tests
pnpm test -- --grep "Enhanced AI Integration"
```

## 📊 Advanced Metadata Scraping

The platform features two sophisticated metadata extraction systems designed to handle both static and dynamic web content:

### 🎭 Puppeteer-Based Metadata Fetcher (Recommended)

**Perfect for modern web applications with client-side rendering (CSR)**

#### Key Features
- **JavaScript Execution**: Fully renders JavaScript-heavy applications (React, Vue, Angular, etc.)
- **Dynamic Content Support**: Waits for content to load before extraction
- **Browser Automation**: Uses real Chrome browser for accurate rendering
- **Performance Optimized**: Configurable image loading, timeouts, and caching
- **Viewport Control**: Customizable browser viewport for responsive testing
- **Resource Management**: Automatic browser cleanup and memory management

#### Usage Example

```javascript
import { PuppeteerMetadataFetcher } from './src/lib/services/puppeteer-metadata-fetcher.js';

const fetcher = new PuppeteerMetadataFetcher({
  timeout: 30000,
  waitForTimeout: 3000,
  enableImages: false, // Faster loading
  enableCaching: true,
  viewport: { width: 1280, height: 720 }
});

const metadata = await fetcher.fetchMetadata('https://spa-app.com');

console.log({
  title: metadata.title,
  description: metadata.description,
  hasJavaScript: metadata.hasJavaScript,
  loadTime: metadata.loadTime,
  viewport: metadata.viewport,
  images: metadata.images,
  structuredData: metadata.structuredData
});

// Always cleanup when done
await fetcher.cleanup();
```

### 🔧 Enhanced Cheerio-Based Fetcher (Legacy)

**Optimized for static HTML content and server-side rendered applications**

#### Core Features
- **Multiple Image Extraction**: Prioritized extraction from Open Graph, Twitter Cards, Apple Touch Icons
- **Enhanced Favicon Detection**: Comprehensive favicon support including multiple sizes and formats
- **Structured Data Parsing**: JSON-LD and Microdata extraction for rich content understanding
- **Social Media Optimization**: Enhanced Twitter Cards and Open Graph metadata
- **Content Type Support**: Handles PDFs, videos, and various media types
- **Malformed HTML Resilience**: Regex fallbacks with HTML entity decoding

#### Usage Example

```javascript
import { EnhancedMetadataFetcher } from './src/lib/services/enhanced-metadata-fetcher.js';

const fetcher = new EnhancedMetadataFetcher({
  enableImageAnalysis: true,
  enableCaching: true,
  cacheMaxAge: 3600,
  timeout: 10000
});

const metadata = await fetcher.fetchMetadata('https://static-site.com');
```

### 🚀 Installation Requirements

For Puppeteer-based fetching, Chrome must be installed:

```bash
# Install Chrome for Puppeteer
npx puppeteer browsers install chrome

# Or install during setup
pnpm install
npx puppeteer browsers install chrome
```

### Metadata Structure

```javascript
{
  url: "https://example.com",
  title: "Page Title",
  description: "Page description",
  contentType: "website", // or "article", "video", "product", etc.
  
  // Enhanced image data
  images: {
    primary: "https://example.com/main-image.jpg",
    sources: [
      {
        url: "https://example.com/og-image.jpg",
        type: "og:image",
        priority: 10,
        width: 1200,
        height: 630
      }
      // ... more images
    ]
  },
  
  // Multiple favicon formats
  favicons: [
    {
      url: "https://example.com/favicon.ico",
      type: "icon",
      sizes: "16x16",
      mimeType: "image/x-icon"
    }
    // ... more favicons
  ],
  
  // Structured data
  structuredData: {
    jsonLd: [/* JSON-LD objects */],
    microdata: [/* Microdata objects */]
  },
  
  // Enhanced social media metadata
  social: {
    twitter: { /* Twitter Card data */ },
    openGraph: { /* Open Graph data */ },
    facebook: { /* Facebook-specific data */ }
  }
}
```

## 🤖 Enhanced AI Service

The platform features a comprehensive AI-powered analysis system that goes beyond basic content rewriting to provide deep insights and optimization recommendations.

### 🧠 Core AI Features

#### **Content Analysis**
- **Readability Assessment**: Flesch Reading Ease scoring with difficulty levels
- **Keyword Density Analysis**: Automatic keyword extraction and frequency analysis
- **Content Length Optimization**: Title and description length recommendations
- **Uniqueness Scoring**: Content originality assessment
- **Completeness Evaluation**: Metadata completeness scoring

#### **SEO Optimization**
- **Title Optimization**: Length, structure, and keyword recommendations
- **Description Enhancement**: Meta description optimization for search engines
- **Keyword Suggestions**: AI-generated relevant keywords
- **Meta Tag Generation**: Automatic Open Graph and Twitter Card suggestions
- **Structured Data**: Schema.org markup recommendations

#### **Sentiment Analysis**
- **Emotional Tone Detection**: Positive, negative, or neutral sentiment analysis
- **Confidence Scoring**: Reliability metrics for sentiment predictions
- **Tone Recommendations**: Suggestions for improving content appeal
- **Emotional Balance**: Analysis of emotional word usage

#### **Category Detection**
- **Industry Classification**: Automatic categorization (productivity, development, design, etc.)
- **Confidence Metrics**: Reliability scoring for category predictions
- **Tag Suggestions**: Relevant tags based on content analysis
- **Secondary Categories**: Alternative classification options

### 🚀 Usage Example

```javascript
import { createEnhancedAIService } from './src/lib/services/enhanced-ai-service.js';

const aiService = createEnhancedAIService({
  enableContentAnalysis: true,
  enableSEOOptimization: true,
  enableSentimentAnalysis: true,
  enableCategoryDetection: true
});

const originalMetadata = {
  title: 'Amazing Productivity App',
  description: 'This app helps you manage tasks efficiently and boost your workflow.',
  url: 'https://example.com/app'
};

const enhanced = await aiService.enhanceMetadata(originalMetadata);

console.log({
  // Enhanced content
  title: enhanced.title,
  description: enhanced.description,
  tags: enhanced.tags,
  
  // AI Analysis
  contentAnalysis: enhanced.aiEnhancements.contentAnalysis,
  seoOptimization: enhanced.aiEnhancements.seoOptimization,
  sentiment: enhanced.aiEnhancements.sentiment,
  category: enhanced.aiEnhancements.category
});

// Cleanup when done
await aiService.cleanup();
```

### 📊 Enhanced Analysis Structure

```javascript
{
  // Enhanced content (AI-rewritten)
  title: "AI-Enhanced Amazing Productivity App",
  description: "AI-Improved description with better appeal",
  tags: ["productivity", "ai-enhanced", "comprehensive"],
  
  // Comprehensive AI analysis
  aiEnhancements: {
    timestamp: "2024-01-01T00:00:00.000Z",
    version: "1.0",
    
    // Content quality metrics
    contentAnalysis: {
      readabilityScore: { score: 75, level: "standard" },
      keywordDensity: {
        keywords: [
          { word: "productivity", count: 2, density: "10.00" }
        ],
        totalWords: 20,
        uniqueWords: 18
      },
      contentLength: { title: 25, description: 120 },
      uniquenessScore: { score: 85, level: "high" },
      completeness: { score: 80, completedFields: 4, totalFields: 5 }
    },
    
    // SEO recommendations
    seoOptimization: {
      titleOptimization: {
        suggestions: [],
        score: 90,
        optimal: true
      },
      descriptionOptimization: {
        suggestions: ["Consider adding action words"],
        score: 85,
        optimal: true
      },
      keywordSuggestions: ["productivity", "app", "workflow"],
      metaTagSuggestions: {
        "og:title": "Amazing Productivity App",
        "og:description": "Enhanced description",
        "twitter:card": "summary_large_image"
      },
      structuredDataSuggestions: {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "Amazing Productivity App"
      }
    },
    
    // Emotional analysis
    sentiment: {
      overall: "positive",
      confidence: 0.8,
      emotions: { positive: 2, negative: 0 },
      tone: "positive",
      recommendations: []
    },
    
    // Content classification
    category: {
      primary: "productivity",
      secondary: null,
      confidence: 0.9,
      tags: ["productivity"],
      industry: "productivity"
    }
  }
}
```

### ⚙️ Configuration Options

```javascript
const aiService = createEnhancedAIService({
  // Feature toggles
  enableContentAnalysis: true,
  enableSEOOptimization: true,
  enableSentimentAnalysis: true,
  enableCategoryDetection: true,
  
  // Custom AI rewriter (optional)
  aiRewriter: customAIRewriter
});
```

### 🔄 Integration with Submission Service

The Enhanced AI Service is seamlessly integrated into the submission workflow:

```javascript
const submissionService = new SubmissionService({
  supabase: supabaseClient,
  useEnhancedAI: true, // Enable comprehensive AI analysis
  enhancedAIService: customAIService // Optional custom service
});

// Submissions automatically include AI analysis
const submission = await submissionService.createSubmission({
  url: 'https://example.com/app'
}, userId);

// Access AI analysis data
console.log(submission.ai_analysis.contentAnalysis);
console.log(submission.ai_analysis.seoOptimization);
```

## 🔄 Submission Workflow

The complete submission process includes:

1. **URL Validation**: Security checks and format validation
2. **Metadata Extraction**: Enhanced scraping with fallbacks
3. **AI Enhancement**: Optional content rewriting and improvement
4. **Duplicate Prevention**: Smart duplicate detection
5. **Database Storage**: Structured data persistence
6. **Federation**: Multi-platform submission (planned)

### API Endpoints

- `POST /api/submissions` - Create new submission
- `GET /api/submissions` - List submissions with pagination
- `GET /api/submissions/[id]` - Get specific submission
- `PUT /api/submissions/[id]` - Update submission
- `DELETE /api/submissions/[id]` - Delete submission

## 🗄 Database Schema

The platform uses PostgreSQL with the following core tables:

- **submissions** - Main submission data
- **federation_targets** - External directory configurations
- **federation_submissions** - Cross-platform submission tracking
- **users** - User accounts and profiles
- **votes** - Community voting system
- **comments** - User feedback and discussions

Row Level Security (RLS) policies ensure data protection and proper access control.

## 🚧 Development Status

### ✅ Completed
- [x] Database schema and migrations
- [x] Core URL submission API endpoint
- [x] Enhanced metadata scraping service
- [x] AI description generation integration
- [x] Enhanced AI Service with comprehensive analysis
- [x] Comprehensive test coverage

### 🔄 In Progress
- [ ] Submission workflow UI
- [ ] Federated directory discovery API
- [ ] Payment integration

### 📋 Planned
- [ ] Moderation and approval system
- [ ] User authentication and verification
- [ ] Platform owner dashboard
- [ ] API documentation
- [ ] Spam prevention and rate limiting
- [ ] Content freshness system
- [ ] Badge/recognition system
- [ ] Production deployment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow TDD principles - write tests first
4. Ensure all tests pass (`pnpm test`)
5. Follow code style guidelines (ESLint + Prettier)
6. Commit changes (`git commit -m 'Add amazing feature'`)
7. Push to branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📝 Code Style

- **Language**: Modern JavaScript (ES2024+) with ESM modules
- **Testing**: Test-Driven Development with Mocha + Chai
- **Formatting**: Prettier with ESLint
- **Architecture**: Service-oriented with clear separation of concerns

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Supabase Documentation](https://supabase.com/docs)
- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)

---

Built with ❤️ using modern web technologies and best practices.