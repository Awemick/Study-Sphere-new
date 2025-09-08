# 🎓 StudySphere AI - Smart Adaptive Flashcards

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Ready-green.svg)](manifest.json)
[![AI-Powered](https://img.shields.io/badge/AI-Powered-Yes-purple.svg)]()

> Transform your study materials into intelligent, adaptive flashcards using cutting-edge AI technology. Master any subject with personalized learning powered by Cohere AI and spaced repetition algorithms.

## ✨ Features

### 🤖 AI-Powered Flashcard Generation
- **Multi-tier AI System**: Cohere AI + Facebook models as backup
- **Smart Content Analysis**: Automatically extracts key concepts and generates relevant questions
- **Multiple Input Methods**: Text, PDF, DOCX, images, and voice recording
- **Intelligent Question Generation**: Creates diverse question types (multiple choice, fill-in-the-blank)

### 🧠 Advanced Learning Features
- **Spaced Repetition Algorithm**: SuperMemo 2 algorithm for optimal learning intervals
- **Adaptive Difficulty**: Questions adjust based on your performance
- **Progress Tracking**: Detailed analytics and learning statistics
- **Study Streaks**: Gamification elements to maintain motivation

### 🎨 Modern User Experience
- **Dark Mode**: Eye-friendly dark theme with system preference detection
- **Progressive Web App**: Installable on desktop and mobile
- **Responsive Design**: Optimized for all screen sizes
- **Offline Capability**: Study without internet connection

### 🔒 Security & Privacy
- **Secure Authentication**: Supabase-powered user management
- **Data Encryption**: All data encrypted in transit and at rest
- **Privacy-First**: No data sold or shared with third parties

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ (for development)
- Modern web browser with ES6 support
- Internet connection for AI features

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/studysphere-ai.git
   cd studysphere-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

### API Keys Setup

Create a `.env` file with the following:

```env
# Cohere AI (Primary AI service)
COHERE_API_KEY=your_cohere_api_key_here

# Hugging Face (Backup AI service)
HUGGING_FACE_API_KEY=your_hugging_face_api_key_here

# Supabase (Database & Auth)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Paystack (Payments)
PAYSTACK_PUBLIC_KEY=your_paystack_public_key
```

## 📖 Usage Guide

### Creating Flashcards

1. **Navigate to Create Tab**
2. **Choose Input Method**:
   - **Paste Text**: Direct text input
   - **Upload Files**: PDF, DOCX, TXT support
   - **Image Upload**: OCR-powered text extraction
   - **Voice Recording**: Speech-to-text conversion

3. **Generate Flashcards**
   - Click "Generate Smart Flashcards"
   - AI analyzes your content
   - Review and save generated cards

### Studying with Spaced Repetition

1. **Go to Study Tab**
2. **Select Study Set**
3. **Click "Study with Spaced Repetition"**
4. **Rate Your Performance**:
   - **Again**: Didn't remember (0% correct)
   - **Hard**: Struggled to remember (50% correct)
   - **Good**: Remembered with effort (80% correct)
   - **Easy**: Remembered easily (100% correct)

### Managing Your Library

- **View All Sets**: Browse your flashcard collections
- **Track Progress**: See detailed learning analytics
- **Export Data**: Download your study materials

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **AI Services**: Cohere AI, Hugging Face Inference API
- **Payments**: Paystack integration
- **PWA**: Service Worker, Web App Manifest

### Project Structure
```
studysphere-ai/
├── index.html              # Main application
├── script.js               # Core application logic
├── Ai-services.js          # AI integration services
├── payment-service.js      # Payment processing
├── supabase.js             # Database client
├── style.css               # Application styles
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── database-schema.sql     # Database setup
└── README.md              # This file
```

### AI Pipeline
```
Input Text → Cohere AI → Flashcard Generation → Quality Check → User Review → Database Storage
     ↓ (if fails)
Fallback → Hugging Face → Local Generation → User Review → Database Storage
```

## 🔧 Configuration

### Environment Variables
```env
# Required
COHERE_API_KEY=your_key
HUGGING_FACE_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key

# Optional
PAYSTACK_PUBLIC_KEY=your_key
NODE_ENV=development
```

### Database Setup
Run the SQL script in your Supabase dashboard:
```sql
-- Execute database-schema.sql in Supabase SQL Editor
```

## 🧪 Testing

### Manual Testing Checklist
- [ ] Flashcard generation from text input
- [ ] File upload (PDF, DOCX, TXT)
- [ ] Image text extraction
- [ ] Voice recording and transcription
- [ ] Spaced repetition algorithm
- [ ] Dark mode toggle
- [ ] PWA installation
- [ ] Offline functionality
- [ ] Payment processing
- [ ] User authentication

### Browser Compatibility
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 📊 Performance Metrics

### AI Generation Speed
- **Cohere API**: ~2-3 seconds per request
- **Hugging Face**: ~3-5 seconds per request
- **Local Fallback**: ~0.5 seconds

### PWA Performance
- **First Load**: < 3 seconds
- **Subsequent Loads**: < 1 second (cached)
- **Offline Support**: Full functionality

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Use ES6+ features
- Follow conventional commit messages
- Add JSDoc comments for functions
- Test in multiple browsers
- Ensure PWA compatibility

## 📝 API Documentation

### AI Services
```javascript
// Generate flashcards from text
const flashcards = await aiService.generateFlashcards(text);

// Extract text from image
const extractedText = await ocrService.extractTextFromImage(imageFile);
```

### Database Operations
```javascript
// Create study set
const studySet = await supabase
  .from('study_sets')
  .insert([{ title, subject, user_id }]);

// Get flashcards with spaced repetition data
const flashcards = await supabase
  .from('flashcards')
  .select('*')
  .eq('study_set_id', setId)
  .gte('next_review', new Date().toISOString());
```

## 🐛 Troubleshooting

### Common Issues

**AI Generation Not Working**
```bash
# Check API keys
console.log('Cohere key:', !!COHERE_API_KEY);
console.log('Hugging Face key:', !!HUGGING_FACE_API_KEY);
```

**PWA Not Installing**
- Ensure HTTPS in production
- Check manifest.json validity
- Verify service worker registration

**Database Connection Issues**
- Check Supabase URL and keys
- Verify Row Level Security policies
- Check network connectivity

## 📈 Roadmap

### Version 2.0
- [ ] Collaborative study groups
- [ ] Advanced analytics dashboard
- [ ] Mobile native apps
- [ ] Integration with learning platforms

### Version 1.5
- [ ] Push notifications for review reminders
- [ ] Advanced question types (matching, ordering)
- [ ] Study session templates
- [ ] Export to Anki format

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Cohere AI** for powerful language models
- **Hugging Face** for accessible AI infrastructure
- **Supabase** for excellent backend-as-a-service
- **Paystack** for seamless payment processing

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/studysphere-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/studysphere-ai/discussions)
- **Email**: support@studysphere.ai

---

**Made with ❤️ for learners worldwide**

⭐ Star this repo if you find it helpful!