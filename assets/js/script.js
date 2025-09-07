// script.js - Main application file with all integrations
import { supabase } from './supabase.js'
import { paymentService, PAYSTACK_PUBLIC_KEY } from './payment-service.js'
import { ocrService } from './Ai-services.js'

// Make functions available globally for onclick handlers
// (These will be assigned after their respective function definitions)

// API Keys (In production, these should be stored securely)
const OCR_SPACE_API_KEY = '';
const HUGGING_FACE_API_KEY = '';
const COHERE_API_KEY = '';

// Simple in-memory cache for flashcard generation
const flashcardCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCacheKey(text) {
  // Create a simple hash of the text for caching
  return text.length + '_' + text.substring(0, 50).replace(/\s+/g, '_');
}

function getCachedFlashcards(text) {
  const key = getCacheKey(text);
  const cached = flashcardCache.get(key);

  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('⚡ Using cached flashcards');
    return cached.flashcards;
  }

  return null;
}

function setCachedFlashcards(text, flashcards) {
  const key = getCacheKey(text);
  flashcardCache.set(key, {
    flashcards: flashcards,
    timestamp: Date.now()
  });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.getElementById('authError').textContent = '';
    document.getElementById('authForm').dataset.mode = 'login';
    document.getElementById('authModalTitle').textContent = 'Sign In';
  }
}

// Extract text from PDF files
async function extractTextFromPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      text += pageText + '\n';
    }

    return text.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF. Please ensure the file is not password-protected.');
  }
}

// Extract text from Word documents
async function extractTextFromWord(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from Word document:', error);
    throw new Error('Failed to extract text from Word document. Please ensure the file is not corrupted.');
  }
}
function showLoading(message = 'Loading...') {
  const loadingState = document.getElementById('loadingState');
  if (loadingState) {
    loadingState.classList.remove('hidden');
    const h3 = loadingState.querySelector('h3');
    if (h3) h3.textContent = message;
  }
  // Optionally hide results while loading
  const resultsSection = document.getElementById('resultsSection');
  if (resultsSection) resultsSection.classList.add('hidden');
}

function hideLoading() {
  const loadingState = document.getElementById('loadingState');
  if (loadingState) loadingState.classList.add('hidden');
}

async function initializeApp() {
  // Check for payment verification on page load
  const urlParams = new URLSearchParams(window.location.search);
  const paymentAction = urlParams.get('payment');
  const reference = urlParams.get('reference');

  // Debug: Log all URL parameters for payment troubleshooting
  if (paymentAction || reference) {
    console.log('Payment callback detected:');
    console.log('Full URL:', window.location.href);
    console.log('All URL params:', Object.fromEntries(urlParams.entries()));
    console.log('Payment action:', paymentAction);
    console.log('Reference:', reference);
  }

  // Handle hash links (for footer navigation)
  handleHashNavigation();

  if (paymentAction === 'verify' && reference) {
    // Show payment verification UI
    document.querySelector('main').style.display = 'none';
    document.getElementById('payment-verification').style.display = 'block';

    // Process payment verification
    try {
      console.log('Verifying payment with reference:', reference);
      const data = await paymentService.verifyPayment(reference);
      console.log('Payment verification response:', data);

      if (data.status === 'success') {
        // Get userId from metadata or try to get from current session
        let userId = data.metadata?.userId;
        let planType = data.metadata?.planType || 'monthly';

        console.log('Payment metadata:', data.metadata);

        // If no userId in metadata, try to get from current session
        if (!userId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            userId = user.id;
            console.log('Using userId from session:', userId);
          } else {
            console.error('No userId found in metadata or session');
            alert('Payment verified but could not identify user. Please contact support.');
            return;
          }
        }

        console.log('Updating premium status for user:', userId, 'plan:', planType);

        // Ensure we have a valid session before updating
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('No valid session for database update');
          alert('Session expired. Please sign in again and contact support.');
          return;
        }

        const { error } = await supabase
          .from('profiles')
          .update({
            is_premium: true,
            premium_expires_at: getPremiumExpiryDate(planType)
          })
          .eq('id', userId);

        if (error) {
          console.error('Error updating premium status:', error);
          alert('Payment verified but there was an error activating your premium account. Please contact support.');
        } else {
          console.log('Premium status updated successfully');
          alert('Payment successful! Your premium account has been activated.');
          // Redirect to clean URL after successful verification
          window.location.href = '/';
        }
      } else {
        console.error('Payment verification failed - status not success:', data);
        alert('Payment verification failed. Please contact support if you were charged.');
      }
    } catch (error) {
      console.error('Payment verification failed:', error);

      // Fallback: Try to verify payment status by checking with Paystack directly
      try {
        console.log('Attempting fallback verification...');
        const fallbackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: {
            'Authorization': `Bearer sk_test_7574295cffb7c1ab4beea751cf6b3407923020d4`
          }
        });

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          console.log('Fallback verification response:', fallbackData);

          if (fallbackData.status && fallbackData.data?.status === 'success') {
            console.log('Fallback verification successful');
            // Try to update premium status with fallback data
            let userId = fallbackData.data.metadata?.userId;
            let planType = fallbackData.data.metadata?.planType || 'monthly';

            if (!userId) {
              const { data: { user } } = await supabase.auth.getUser();
              userId = user?.id;
            }

            if (userId) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                const { error } = await supabase
                  .from('profiles')
                  .update({
                    is_premium: true,
                    premium_expires_at: getPremiumExpiryDate(planType)
                  })
                  .eq('id', userId);

                if (!error) {
                  alert('Payment successful! Your premium account has been activated.');
                  window.location.href = '/';
                  return;
                }
              }
            }
          }
        }
      } catch (fallbackError) {
        console.error('Fallback verification also failed:', fallbackError);
      }

      alert('Payment verification failed. Please contact support if you were charged.');
    }
    return; // Exit early if handling payment verification
  }

  // Handle legacy payment-verification.html redirects (fallback)
  if (window.location.pathname.includes('payment-verification.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference') || urlParams.get('trxref');

    if (reference) {
      // Show payment verification UI
      document.querySelector('main').style.display = 'none';
      document.getElementById('payment-verification').style.display = 'block';

      // Process payment verification
      try {
        console.log('Legacy verification - reference:', reference);
        const data = await paymentService.verifyPayment(reference);
        console.log('Legacy verification response:', data);

        if (data.status === 'success') {
          // Get userId from metadata or try to get from current session
          let userId = data.metadata?.userId;
          let planType = data.metadata?.planType || 'monthly';

          console.log('Legacy payment metadata:', data.metadata);

          // If no userId in metadata, try to get from current session
          if (!userId) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              userId = user.id;
              console.log('Legacy: Using userId from session:', userId);
            } else {
              console.error('Legacy: No userId found in metadata or session');
              alert('Payment verified but could not identify user. Please contact support.');
              return;
            }
          }

          console.log('Legacy: Updating premium status for user:', userId, 'plan:', planType);

          // Ensure we have a valid session before updating
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            console.error('Legacy: No valid session for database update');
            alert('Session expired. Please sign in again and contact support.');
            return;
          }

          const { error } = await supabase
            .from('profiles')
            .update({
              is_premium: true,
              premium_expires_at: getPremiumExpiryDate(planType)
            })
            .eq('id', userId);

          if (error) {
            console.error('Legacy: Error updating premium status:', error);
            alert('Payment verified but there was an error activating your premium account. Please contact support.');
          } else {
            console.log('Legacy: Premium status updated successfully');
            alert('Payment successful! Your premium account has been activated.');
            window.location.href = '/';
          }
        } else {
          console.error('Legacy: Payment verification failed - status not success:', data);
          alert('Payment verification failed. Please contact support if you were charged.');
        }
      } catch (error) {
        console.error('Legacy: Payment verification failed:', error);

        // Fallback: Try to verify payment status by checking with Paystack directly
        try {
          console.log('Legacy: Attempting fallback verification...');
          const fallbackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
              'Authorization': `Bearer sk_test_7574295cffb7c1ab4beea751cf6b3407923020d4`
            }
          });

          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            console.log('Legacy: Fallback verification response:', fallbackData);

            if (fallbackData.status && fallbackData.data?.status === 'success') {
              console.log('Legacy: Fallback verification successful');
              // Try to update premium status with fallback data
              let userId = fallbackData.data.metadata?.userId;
              let planType = fallbackData.data.metadata?.planType || 'monthly';

              if (!userId) {
                const { data: { user } } = await supabase.auth.getUser();
                userId = user?.id;
              }

              if (userId) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                  const { error } = await supabase
                    .from('profiles')
                    .update({
                      is_premium: true,
                      premium_expires_at: getPremiumExpiryDate(planType)
                    })
                    .eq('id', userId);

                  if (!error) {
                    alert('Payment successful! Your premium account has been activated.');
                    window.location.href = '/';
                    return;
                  }
                }
              }
            }
          }
        } catch (fallbackError) {
          console.error('Legacy: Fallback verification also failed:', fallbackError);
        }

        alert('Payment verification failed. Please contact support if you were charged.');
      }
    }
    return;
  }

  // Check authentication state
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // User signed in
        updateUIForAuthenticatedUser();
      } else if (event === 'SIGNED_OUT') {
        // User signed out
        updateUIForAnonymousUser();
      }
    }
  );

  // Check current auth status
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    updateUIForAuthenticatedUser();
  } else {
    updateUIForAnonymousUser();
  }

  // Set up event listeners
  setupEventListeners();
}

function setupEventListeners() {
  // Initialize theme
  initializeTheme();

  // Initialize PWA features
  registerServiceWorker();
  checkInstallPrompt();

  // Initialize gamification
  initializeGamification();

  // Initialize hero visibility for default active tab
  const heroSection = document.querySelector('.hero');
  const activeTab = document.querySelector('.nav-link.active');
  if (heroSection && activeTab && activeTab.dataset.tab !== 'generate') {
    heroSection.style.display = 'none';
  }

  // Auth button
  document.getElementById('authBtn').addEventListener('click', handleAuthClick);
  
  // File uploads
  const fileInput = document.getElementById('fileUpload');
  const imageInput = document.getElementById('imageUpload');
  
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }
  
  if (imageInput) {
    imageInput.addEventListener('change', handleImageUpload);
  }
  
  // Upload area click handlers
  const uploadArea = document.getElementById('uploadArea');
  const imageUploadArea = document.getElementById('imageUploadArea');
  
  if (uploadArea) {
    uploadArea.addEventListener('click', () => document.getElementById('fileUpload').click());
  }
  
  if (imageUploadArea) {
    imageUploadArea.addEventListener('click', () => document.getElementById('imageUpload').click());
  }
  
  // Process file button
  const processFileBtn = document.getElementById('processFileBtn');
  if (processFileBtn) {
    processFileBtn.addEventListener('click', processUploadedFile);
  }
  
  // Extract text button
  const extractTextBtn = document.getElementById('extractTextBtn');
  if (extractTextBtn) {
    extractTextBtn.addEventListener('click', extractTextFromImage);
  }
  
  // Record button
  const recordBtn = document.getElementById('recordBtn');
  if (recordBtn) {
    recordBtn.addEventListener('click', handleRecordClick);
  }
  
  // Generate flashcards button
  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerateFlashcards);
  }
  
  // Save transcript button
  const saveTranscriptBtn = document.getElementById('saveTranscriptBtn');
  if (saveTranscriptBtn) {
    saveTranscriptBtn.addEventListener('click', saveTranscript);
  }
  
  // Premium upgrade buttons
  document.querySelectorAll('.plan-btn').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      const planType = event.target.dataset.plan;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to upgrade to premium.');
        showAuthModal();
        return;
      }
      try {
        await handlePremiumUpgradePayment(user.id, planType);
      } catch (error) {
        console.error('Premium upgrade error:', error);
        alert('Failed to initialize payment. Please try again.');
      }
    });
  });
  
  // Payment modal button
  const paymentButton = document.getElementById('intaSendButton');
  if (paymentButton) {
    paymentButton.addEventListener('click', handlePayment);
  }
  
  // Mobile menu toggle
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const nav = document.querySelector('.nav');

  if (mobileMenuToggle && nav) {
    mobileMenuToggle.addEventListener('click', function() {
      nav.classList.toggle('mobile-menu-open');
      const icon = this.querySelector('i');
      if (icon) {
        if (nav.classList.contains('mobile-menu-open')) {
          icon.className = 'ri-close-line';
        } else {
          icon.className = 'ri-menu-line';
        }
      }
    });

    // Close mobile menu when clicking on a nav link
    const navLinks = nav.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', function() {
        nav.classList.remove('mobile-menu-open');
        const icon = mobileMenuToggle.querySelector('i');
        if (icon) {
          icon.className = 'ri-menu-line';
        }
      });
    });
  }

  // Tab navigation
  const tabLinks = document.querySelectorAll('.nav-link');
  tabLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const tabName = this.dataset.tab;
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const tabPane = document.getElementById(`${tabName}-tab`);
      if (tabPane) tabPane.classList.add('active');
      tabLinks.forEach(l => l.classList.remove('active'));
      this.classList.add('active');
      // Show/hide hero section based on active tab
      const heroSection = document.querySelector('.hero');
      if (heroSection) {
        if (tabName === 'generate') {
          heroSection.style.display = 'block';
        } else {
          heroSection.style.display = 'none';
        }
      }
      // Load data for each tab
      if (tabName === 'study') loadStudySets();
      if (tabName === 'library') loadLibrary();
      if (tabName === 'stats' || tabName === 'analytics') loadAnalytics();
    });
  });
  
  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Upgrade link - switch to pricing tab
  const upgradeLink = document.getElementById('upgradeLink');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', function(e) {
      e.preventDefault();
      // Switch to pricing tab
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const pricingTab = document.getElementById('pricing-tab');
      if (pricingTab) pricingTab.classList.add('active');

      // Update navigation
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const pricingNav = document.querySelector('.nav-link[data-tab="pricing"]');
      if (pricingNav) pricingNav.classList.add('active');

      // Scroll to top for better UX
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Library tab navigation
  document.querySelectorAll('.library-nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const section = this.dataset.section;

      // Update active button
      document.querySelectorAll('.library-nav-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      // Show corresponding section
      document.querySelectorAll('.library-section').forEach(s => s.classList.remove('active'));
      const targetSection = document.getElementById(`library-${section}-section`);
      if (targetSection) {
        targetSection.classList.add('active');
      }

      // Load data for the section
      if (section === 'sets' || section === 'flashcards') {
        loadLibrary();
      }
    });
  });

  // Hero section buttons
  const startLearningBtn = document.querySelector('.cta-primary');
  const watchDemoBtn = document.querySelector('.cta-secondary');

  if (startLearningBtn) {
    startLearningBtn.addEventListener('click', () => {
      document.getElementById('generate-tab').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Watch Demo button functionality
  if (watchDemoBtn) {
    watchDemoBtn.addEventListener('click', () => {
      // Redirect to demo video URL
      window.open('https://files.fm/u/cfwb3286qa', '_blank');
      // Replace the URL above with your actual demo video URL
    });
  }
  
  // Close auth modal button
  document.getElementById('closeAuthModal').addEventListener('click', () => {
    document.getElementById('authModal').classList.add('hidden');
  });

  // Profile menu functionality
  const profileMenuBtn = document.getElementById('profileMenuBtn');
  const profileDropdown = document.getElementById('profileDropdown');

  if (profileMenuBtn && profileDropdown) {
    profileMenuBtn.addEventListener('click', () => {
      profileDropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!profileMenuBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
        profileDropdown.classList.add('hidden');
      }
    });
  }

  // Sign out button
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
      } else {
        updateUIForAnonymousUser();
        profileDropdown.classList.add('hidden');
      }
    });
  }
  
  // Toggle auth mode (login/signup)
  document.getElementById('toggleAuthMode').addEventListener('click', () => {
    const form = document.getElementById('authForm');
    const signupFields = document.getElementById('signupFields');
    if (form.dataset.mode === 'login') {
      form.dataset.mode = 'signup';
      document.getElementById('authModalTitle').textContent = 'Create Account';
      document.getElementById('toggleAuthMode').textContent = 'Already have an account? Sign In';
      signupFields.style.display = 'block';
    } else {
      form.dataset.mode = 'login';
      document.getElementById('authModalTitle').textContent = 'Sign In';
      document.getElementById('toggleAuthMode').textContent = 'Create new account';
      signupFields.style.display = 'none';
    }
    document.getElementById('authError').textContent = '';
  });
  
  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const mode = e.target.dataset.mode;

    let result;
    if (mode === 'signup') {
      const fullName = document.getElementById('authFullName').value;
      const dateOfBirth = document.getElementById('authDateOfBirth').value;

      // Validate required fields for signup
      if (!fullName.trim()) {
        document.getElementById('authError').textContent = 'Full name is required';
        return;
      }
      if (!dateOfBirth) {
        document.getElementById('authError').textContent = 'Date of birth is required';
        return;
      }

      // Sign up the user with metadata
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            date_of_birth: dateOfBirth
          }
        }
      });

      // If signup successful, the database trigger will automatically create the profile
      if (!result.error && result.data.user) {
        console.log('Signup successful! Profile will be created automatically by database trigger.');
      }
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
      document.getElementById('authError').textContent = result.error.message;
    } else {
      document.getElementById('authModal').classList.add('hidden');
      updateUIForAuthenticatedUser();
    }
  });
  
  // Share button functionality
  document.getElementById('shareBtn').addEventListener('click', async () => {
    const flashcards = [];
    document.querySelectorAll('#flashcardsGrid .flashcard').forEach(cardEl => {
      const question = cardEl.querySelector('p strong') ? cardEl.querySelector('p strong').nextSibling.textContent.trim() : '';
      const answer = cardEl.querySelector('.answer') ? cardEl.querySelector('.answer').textContent.replace('Correct:', '').trim() : '';
      if (question && answer) {
        flashcards.push({ question, answer });
      }
    });

    if (flashcards.length === 0) {
      alert('No flashcards to share. Generate some flashcards first!');
      return;
    }

    // Create shareable text
    let shareText = "📚 StudySphere AI Flashcards\n\n";
    flashcards.forEach((card, index) => {
      shareText += `${index + 1}. Q: ${card.question}\n   A: ${card.answer}\n\n`;
    });
    shareText += "🚀 Created with StudySphere AI - Smart Adaptive Flashcards!\n#StudySphere #Flashcards #Learning";

    // Try native Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'StudySphere AI Flashcards',
          text: shareText,
          url: window.location.origin
        });
        return;
      } catch (error) {
        console.log('Share cancelled or failed:', error);
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      alert('Flashcards copied to clipboard! You can now paste them anywhere.');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Final fallback: Show text in alert
      alert('Copy this text to share:\n\n' + shareText);
    }
  });

  document.getElementById('saveToLibraryBtn').addEventListener('click', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please sign in to save your flashcards.');
      showAuthModal();
      return;
    }
    // Get flashcards from the DOM
    const flashcards = [];
    document.querySelectorAll('#flashcardsGrid .flashcard').forEach(cardEl => {
      const question = cardEl.querySelector('p strong') ? cardEl.querySelector('p strong').nextSibling.textContent.trim() : '';
      const answer = cardEl.querySelector('.answer') ? cardEl.querySelector('.answer').textContent.replace('Correct:', '').trim() : '';
      flashcards.push({ question, answer });
    });
    if (flashcards.length === 0) {
      alert('No flashcards to save.');
      return;
    }

    // Show save modal instead of prompt
    showSaveModal(flashcards);
  });
}

async function handleAuthClick() {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // User is logged in, toggle profile dropdown
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) {
      profileDropdown.classList.toggle('hidden');
    }
  } else {
    // User is not logged in, show auth modal
    showAuthModal();
  }
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Show file preview
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('filePreview').classList.remove('hidden');
}

async function processUploadedFile() {
  const fileInput = document.getElementById('fileUpload');
  const file = fileInput.files[0];

  if (!file) {
    alert('Please select a file first.');
    return;
  }

  // Check supported file types
  const supportedTypes = [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];

  const fileExtension = file.name.toLowerCase().split('.').pop();
  const isSupported = supportedTypes.includes(file.type) ||
                     ['txt', 'pdf', 'docx', 'doc'].includes(fileExtension);

  if (!isSupported) {
    alert('Supported file types: TXT, PDF, DOCX, DOC');
    return;
  }

  try {
    showLoading('Processing file...');
    let text = '';

    if (file.type.startsWith('text/') || fileExtension === 'txt') {
      // Handle plain text files
      text = await readFileAsText(file);
    } else if (file.type === 'application/pdf' || fileExtension === 'pdf') {
      // Handle PDF files
      text = await extractTextFromPDF(file);
    } else if (file.type.includes('word') || ['docx', 'doc'].includes(fileExtension)) {
      // Handle Word documents
      text = await extractTextFromWord(file);
    }

    document.querySelector('.notes-input').value = text;
    hideLoading();
  } catch (error) {
    console.error('Error reading file:', error);
    hideLoading();
    alert('Failed to read file. Please try again.');
  }
}

async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Show image preview
  const previewImage = document.getElementById('previewImage');
  previewImage.src = URL.createObjectURL(file);
  document.getElementById('imagePreview').classList.remove('hidden');
}

async function extractTextFromImage() {
  const imageInput = document.getElementById('imageUpload');
  const file = imageInput.files[0];

  if (!file) {
    alert('Please select an image first.');
    return;
  }

  try {
    showLoading('Extracting text from image...');
    const text = await ocrService.extractTextFromImage(file);
    document.querySelector('.notes-input').value = text;
    hideLoading();
  } catch (error) {
    console.error('Error extracting text:', error);
    hideLoading();
    alert('Failed to extract text from image. Please try again.');
  }
}

let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingStartTime = null;

async function handleRecordClick() {
  const recordBtn = document.getElementById('recordBtn');
  const recordingStatus = document.querySelector('.recording-status');
  const voiceActions = document.querySelector('.voice-actions');

  if (recordBtn.classList.contains('recording')) {
    // Stop recording
    stopRecording();
  } else {
    // Start recording
    try {
      await startRecording();
    } catch (error) {
      console.error('Recording failed:', error);
      alert('Recording not supported on this device or permission denied.');
    }
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      await processAudioRecording(audioBlob);
      stopStream();
    };

    mediaRecorder.start();
    recordingStartTime = Date.now();
    startRecordingTimer();

    const recordBtn = document.getElementById('recordBtn');
    const recordingStatus = document.querySelector('.recording-status');
    const voiceActions = document.querySelector('.voice-actions');

    recordBtn.classList.add('recording');
    recordBtn.innerHTML = '<i class="ri-stop-fill"></i> Stop Recording';
    if (recordingStatus) recordingStatus.classList.remove('hidden');
    if (voiceActions) voiceActions.classList.remove('hidden');

  } catch (error) {
    console.error('Error starting recording:', error);
    throw error;
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  stopRecordingTimer();

  const recordBtn = document.getElementById('recordBtn');
  recordBtn.classList.remove('recording');
  recordBtn.innerHTML = '<i class="ri-mic-fill"></i> Start Recording';
}

function stopStream() {
  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}

function startRecordingTimer() {
  const timerElement = document.getElementById('recordingTimer');
  if (!timerElement) return;

  recordingTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

async function processAudioRecording(audioBlob) {
  try {
    const transcriptPreview = document.getElementById('transcriptPreview');
    if (!transcriptPreview) return;

    // Show processing message
    transcriptPreview.textContent = "Processing your recording...";

    // For now, we'll simulate speech-to-text since actual STT requires additional services
    // In production, you would send this to a speech-to-text service like:
    // - Google Speech-to-Text API
    // - Azure Speech Services
    // - AWS Transcribe
    // - Web Speech API (browser-based, limited)

    // Simulate processing delay
    setTimeout(() => {
      transcriptPreview.textContent = "This is a simulated transcript from your voice recording. In production, this would use actual speech-to-text processing from services like Google Speech-to-Text or Azure Cognitive Services.";

      // Show save button
      const saveBtn = document.getElementById('saveTranscriptBtn');
      if (saveBtn) saveBtn.classList.remove('hidden');
    }, 2000);

  } catch (error) {
    console.error('Error processing audio:', error);
    const transcriptPreview = document.getElementById('transcriptPreview');
    if (transcriptPreview) {
      transcriptPreview.textContent = "Error processing recording. Please try again.";
    }
  }
}

async function saveTranscript() {
  const transcript = document.getElementById('transcriptPreview').textContent;
  document.querySelector('.notes-input').value = transcript;
}

async function handleGenerateFlashcards() {
  const inputText = document.querySelector('.notes-input').value;
  console.log('Input text:', inputText); // Add this line
  if (!inputText.trim()) {
    alert('Please enter some text or upload content first.');
    return;
  }
  
  try {
    showLoading('Generating flashcards...');
    
    // Generate flashcards using AI
    const flashcards = await generateFlashcardsAI(inputText);
    
    // Display flashcards
    displayFlashcards(flashcards);
    
    hideLoading();
  } catch (error) {
    console.error('Error generating flashcards:', error);
    hideLoading();
    alert('Failed to generate flashcards. Please try again.');
  }
}

// Cohere API integration
async function generateFlashcardsWithCohere(text) {
  try {
    console.log('Trying Cohere API...');

    const response = await fetch('https://api.cohere.ai/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
        'Cohere-Version': '2022-12-06'
      },
      body: JSON.stringify({
        model: 'command',
        prompt: `Generate 5 multiple-choice flashcards from the following text. Format as JSON array: [{"question": "Question?", "options": ["A. Option1", "B. Option2", "C. Option3", "D. Option4"], "answer": "Correct Answer"}]. Text: ${text.substring(0, 800)}`,
        max_tokens: 500,
        temperature: 0.7,
        stop_sequences: ["\n\n"]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Cohere API failed:', response.status, errorText);
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Cohere API result:', result);

    // Extract JSON from Cohere response
    const generatedText = result.generations?.[0]?.text || '';
    console.log('Cohere generated text:', generatedText);

    const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const flashcards = JSON.parse(jsonMatch[0]);
        console.log('Successfully parsed flashcards from Cohere:', flashcards);
        return flashcards;
      } catch (parseError) {
        console.warn('JSON parsing failed from Cohere:', parseError);
      }
    }

    throw new Error('Could not extract valid flashcards from Cohere response');

  } catch (error) {
    console.error('Cohere API error:', error);
    throw error;
  }
}

// Optimized Hugging Face API integration with parallel model attempts
async function generateFlashcardsWithHuggingFaceFast(text) {
  const models = [
    'google/flan-t5-base',               // Google's instruction-following model (most reliable)
    'facebook/blenderbot-400M-distill',  // Facebook's conversational model
    'microsoft/DialoGPT-medium',         // Microsoft's conversational model
  ];

  console.log('🚀 Starting parallel Hugging Face model attempts...');

  // Create parallel requests for all models
  const modelPromises = models.map(async (model, index) => {
    try {
      console.log(`🤖 Trying model ${index + 1}/${models.length}: ${model}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per model

      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          headers: {
            'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            inputs: `Generate 5 flashcards from: ${text.substring(0, 400)}\nFormat: Question? Answer`,
            parameters: {
              max_new_tokens: 150,
              temperature: 0.7,
              do_sample: true
            }
          })
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Extract text from response
      let generatedText = '';
      if (Array.isArray(result) && result[0] && result[0].generated_text) {
        generatedText = result[0].generated_text;
      } else if (result.generated_text) {
        generatedText = result.generated_text;
      } else if (typeof result === 'string') {
        generatedText = result;
      }

      // Quick flashcard extraction
      const flashcards = extractFlashcardsFromText(generatedText);

      if (flashcards.length >= 3) {
        console.log(`✅ Model ${model} succeeded! Generated ${flashcards.length} flashcards`);
        return flashcards;
      }

      return null; // Not enough flashcards

    } catch (error) {
      console.warn(`❌ Model ${model} failed:`, error.message);
      return null;
    }
  });

  // Race all models - first successful one wins
  try {
    const results = await Promise.allSettled(modelPromises);

    // Find first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value && result.value.length >= 3) {
        return result.value;
      }
    }

    throw new Error('No model produced sufficient flashcards');

  } catch (error) {
    console.warn('❌ All Hugging Face models failed');
    throw error;
  }
}

// Helper function to quickly extract flashcards from generated text
function extractFlashcardsFromText(text) {
  const flashcards = [];
  const lines = text.split('\n').filter(line => line.trim());

  for (let i = 0; i < lines.length && flashcards.length < 5; i++) {
    const line = lines[i].trim();

    // Look for question patterns
    if (line.includes('?') && line.length > 10) {
      const question = line.replace(/^(Question\s*\d*:?\s*)/i, '').trim();

      // Look for answer in next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.includes('?') && nextLine.length > 5) {
          const answer = nextLine.replace(/^(Answer:?\s*)/i, '').trim();

          if (question && answer) {
            flashcards.push({ question, answer });
            i++; // Skip the answer line
          }
        }
      }
    }
  }

  return flashcards;
}

async function generateFlashcardsAI(text) {
  try {
    console.log('🚀 Starting optimized AI flashcard generation...');
    console.log('📝 Input text length:', text.length);

    // Check cache first
    const cachedResult = getCachedFlashcards(text);
    if (cachedResult) {
      console.log('⚡ Cache hit! Returning cached flashcards');
      return cachedResult;
    }

    // Check API configurations
    const hasCohere = COHERE_API_KEY && COHERE_API_KEY !== 'YOUR_COHERE_API_KEY_HERE';
    const hasHuggingFace = HUGGING_FACE_API_KEY && HUGGING_FACE_API_KEY !== 'YOUR_HUGGING_FACE_API_KEY_HERE';

    console.log('🔑 Cohere configured:', hasCohere ? 'Yes' : 'No');
    console.log('🔑 Hugging Face configured:', hasHuggingFace ? 'Yes' : 'No');

    // Create promises for all available APIs (parallel execution)
    const apiPromises = [];

    if (hasCohere) {
      console.log('🎯 Adding Cohere API to race...');
      apiPromises.push(
        Promise.race([
          generateFlashcardsWithCohere(text),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cohere timeout')), 8000)
          )
        ]).catch(error => {
          console.warn('❌ Cohere failed:', error.message);
          return null;
        })
      );
    }

    if (hasHuggingFace) {
      console.log('🤖 Adding Hugging Face API to race...');
      apiPromises.push(
        Promise.race([
          generateFlashcardsWithHuggingFaceFast(text), // Optimized version
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Hugging Face timeout')), 10000)
          )
        ]).catch(error => {
          console.warn('❌ Hugging Face failed:', error.message);
          return null;
        })
      );
    }

    // If no APIs configured, go straight to local generation
    if (apiPromises.length === 0) {
      console.log('⚡ No APIs configured, using fast local generation');
      return generateSimpleMCFlashcards(text);
    }

    console.log(`🏁 Racing ${apiPromises.length} API calls...`);

    // Race all API calls - first one to succeed wins
    const results = await Promise.allSettled(apiPromises);

    // Find the first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value && Array.isArray(result.value) && result.value.length > 0) {
        console.log('✅ API race winner! Generated', result.value.length, 'flashcards');
        setCachedFlashcards(text, result.value); // Cache the result
        return result.value;
      }
    }

    // If all APIs failed, use local generation
    console.log('🔄 All APIs failed, using local generation');
    const flashcards = generateSimpleMCFlashcards(text);
    console.log('✅ Local generation succeeded! Generated', flashcards.length, 'flashcards');
    setCachedFlashcards(text, flashcards); // Cache the result
    return flashcards;

  } catch (error) {
    console.error('❌ Critical error in AI generation:', error);
    // Always fallback to simple generation as last resort
    const flashcards = generateSimpleMCFlashcards(text);
    console.log('✅ Emergency local generation succeeded! Generated', flashcards.length, 'flashcards');
    setCachedFlashcards(text, flashcards); // Cache the result
    return flashcards;
  }
}

// Simple fallback for multiple-choice flashcards
function generateSimpleMCFlashcards(text) {
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10);
  const flashcards = [];

  // If we have very little text, create basic flashcards
  if (sentences.length < 2) {
    const words = text.split(' ').filter(w => w.length > 3);
    if (words.length >= 3) {
      for (let i = 0; i < Math.min(words.length - 2, 5); i++) {
        const keyWord = words[i];
        const question = `What is the meaning of "${keyWord}" in the context of this text?`;
        const answer = `The word "${keyWord}" appears in the text and is part of the content.`;

        flashcards.push({
          question,
          options: [
            `A. ${answer}`,
            'B. This word is not in the text',
            'C. This is a different word',
            'D. Cannot determine from text'
          ],
          answer: answer
        });
      }
    }
  } else {
    // Normal sentence-based generation
    for (let i = 0; i < Math.min(sentences.length, 5); i++) {
      const sentence = sentences[i].trim();
      if (sentence.length < 15) continue;

      const words = sentence.split(' ').filter(w => w.length > 2);
      if (words.length < 4) continue;

      const keyTermIndex = Math.floor(words.length / 2);
      const keyTerm = words[keyTermIndex];
      words[keyTermIndex] = '______';

      // Generate options with the correct answer and some distractors
      const options = [keyTerm];
      const distractors = words.slice(1, 4).filter(w => w !== keyTerm);
      options.push(...distractors);

      // Ensure we have exactly 4 options
      while (options.length < 4) {
        options.push('general knowledge');
      }

      flashcards.push({
        question: words.join(' ') + '?',
        options: options.slice(0, 4).map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${opt}`),
        answer: keyTerm
      });
    }
  }

  // Ensure we always return at least one flashcard
  if (flashcards.length === 0) {
    flashcards.push({
      question: 'What is the main topic of this text?',
      options: ['A. General knowledge', 'B. Study material', 'C. Educational content', 'D. Learning resource'],
      answer: 'Educational content'
    });
  }

  return flashcards;
}

// Display flashcards with options
function displayFlashcards(flashcards) {
  const flashcardsGrid = document.getElementById('flashcardsGrid');
  if (!flashcardsGrid) return;
  flashcardsGrid.innerHTML = '';
  flashcards.forEach((card, index) => {
    const optionsHtml = card.options
      ? card.options.map((opt, i) =>
          `<button class="option-btn" data-correct="${opt === card.answer}">${String.fromCharCode(65 + i)}. ${opt}</button>`
        ).join('')
      : '';
    const cardElement = document.createElement('div');
    cardElement.className = 'flashcard';
    cardElement.innerHTML = `
      <div class="flashcard-content">
        <h4>Card ${index + 1}</h4>
        <p><strong>Q:</strong> ${card.question}</p>
        <div class="options">${optionsHtml}</div>
        <p class="answer" style="display:none;"><strong>Correct:</strong> ${card.answer}</p>
      </div>
    `;
    // Option click handler
    cardElement.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        cardElement.querySelector('.answer').style.display = 'block';
        btn.classList.add(btn.dataset.correct === "true" ? 'correct' : 'incorrect');
      });
    });
    flashcardsGrid.appendChild(cardElement);
  });
  document.getElementById('resultsSection').classList.remove('hidden');
}

async function handlePremiumUpgradePayment(userId, planType) {
  try {
    // Show loading state
    const button = document.querySelector(`[data-plan="${planType}"]`);
    if (button) {
      button.disabled = true;
      button.textContent = 'Processing...';
    }

    // Initialize payment with Paystack
    await paymentService.handlePremiumUpgrade(userId, planType);

  } catch (error) {
    console.error('Payment initialization error:', error);
    alert('Failed to initialize payment. Please try again.');

    // Reset button state
    const button = document.querySelector(`[data-plan="${planType}"]`);
    if (button) {
      button.disabled = false;
      button.textContent = planType === 'monthly' ? 'Upgrade Monthly' : 'Upgrade Yearly';
    }
  }
}

async function handlePremiumUpgrade(event) {
  event.preventDefault();

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Please sign in to upgrade to premium.');
    showAuthModal();
    return;
  }

  const planType = event.target.closest('.pricing-card').classList.contains('premium') ? 'monthly' : 'yearly';

  try {
    await handlePremiumUpgradePayment(user.id, planType);
  } catch (error) {
    console.error('Premium upgrade error:', error);
    alert('Failed to initialize payment. Please try again.');
  }
}

async function handlePayment() {
  // This would be called from the premium modal
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Please sign in to upgrade to premium.');
    showAuthModal();
    return;
  }
  
  try {
    await handlePremiumUpgradePayment(user.id, 'monthly');
  } catch (error) {
    console.error('Payment error:', error);
    alert('Failed to initialize payment. Please try again.');
  }
}

// Analytics loading function
async function loadAnalytics() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: sets } = await supabase
    .from('study_sets')
    .select('*')
    .eq('user_id', user.id);

  const totalSets = sets ? sets.length : 0;
  const subjects = sets ? [...new Set(sets.map(s => s.subject))] : [];
  let totalCards = 0;
  if (sets && sets.length > 0) {
    const setIds = sets.map(set => set.id);
    const { data: flashcards } = await supabase
      .from('flashcards')
      .select('*')
      .in('study_set_id', setIds);
    totalCards = flashcards ? flashcards.length : 0;
  }
  const studyTime = Math.floor(Math.random() * 120); // Simulated
  const streak = Math.floor(Math.random() * 7); // Simulated

  document.getElementById('analyticsSummary').innerHTML = `
    <ul>
      <li><strong>Total Study Sets:</strong> ${totalSets}</li>
      <li><strong>Total Flashcards:</strong> ${totalCards}</li>
      <li><strong>Subjects Studied:</strong> ${subjects.join(', ') || 'None'}</li>
      <li><strong>Estimated Study Time:</strong> ${studyTime} minutes</li>
      <li><strong>Current Streak:</strong> ${streak} days</li>
    </ul>
  `;
}

// Call this when analytics tab is shown
loadAnalytics();

// Spaced Repetition Algorithm
function calculateNextReview(flashcard, performance) {
  // SuperMemo 2 algorithm
  const intervals = [1, 6, 16, 39, 94, 225, 540]; // days
  let easeFactor = flashcard.easeFactor || 2.5;
  let repetitions = flashcard.repetitions || 0;

  if (performance >= 0.8) { // Correct answer
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor + 0.1);
  } else { // Incorrect answer
    repetitions = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  }

  const intervalIndex = Math.min(repetitions, intervals.length - 1);
  const daysToAdd = repetitions === 0 ? 1 : intervals[intervalIndex];

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + daysToAdd);

  return {
    nextReview: nextReview.toISOString(),
    easeFactor: easeFactor,
    repetitions: repetitions,
    interval: daysToAdd
  };
}

function getDueFlashcards(flashcards) {
  const now = new Date();
  return flashcards.filter(card => {
    if (!card.nextReview) return true; // New cards
    return new Date(card.nextReview) <= now;
  });
}

// Load study sets for the user
async function loadStudySets() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: sets } = await supabase
    .from('study_sets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const list = document.getElementById('studySetsList');
  const noSetsMsg = document.getElementById('noStudySetsMessage');
  if (!list) return;

  list.innerHTML = '';
  if (!sets || sets.length === 0) {
    noSetsMsg.classList.remove('hidden');
    return;
  }
  noSetsMsg.classList.add('hidden');
  sets.forEach(set => {
    const el = document.createElement('div');
    el.className = 'study-set_card';
    el.innerHTML = `<strong>${set.title}</strong> <span>${set.subject}</span>
                    <button onclick="startSpacedRepetition(${set.id})" class="study-btn">Study with Spaced Repetition</button>`;
    list.appendChild(el);
  });
}

// Spaced repetition study session
async function startSpacedRepetition(setId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Get flashcards for this set
  const { data: flashcards } = await supabase
    .from('flashcards')
    .select('*')
    .eq('study_set_id', setId);

  if (!flashcards || flashcards.length === 0) {
    alert('No flashcards found in this set.');
    return;
  }

  // Get due flashcards
  const dueCards = getDueFlashcards(flashcards);
  if (dueCards.length === 0) {
    alert('No flashcards due for review today!');
    return;
  }

  // Start study session
  let currentIndex = 0;
  let correctCount = 0;

  function showNextCard() {
    if (currentIndex >= dueCards.length) {
      // Session complete
      const score = Math.round((correctCount / dueCards.length) * 100);
      alert(`Study session complete!\n\nCorrect answers: ${correctCount}/${dueCards.length} (${score}%)\n\nGreat job! Keep up the good work!`);
      return;
    }

    const card = dueCards[currentIndex];
    const studyModal = document.createElement('div');
    studyModal.className = 'study-modal';
    studyModal.innerHTML = `
      <div class="study-modal-content">
        <div class="study-header">
          <span>Card ${currentIndex + 1} of ${dueCards.length}</span>
          <button onclick="this.closest('.study-modal').remove()" class="close-btn">×</button>
        </div>
        <div class="flashcard-study">
          <div class="question">${card.question}</div>
          <div class="answer hidden">${card.answer}</div>
          <div class="study-controls">
            <button onclick="this.closest('.flashcard-study').querySelector('.answer').classList.remove('hidden'); this.style.display='none'" class="show-answer-btn">Show Answer</button>
            <div class="rating-buttons hidden">
              <button onclick="rateCard('again')" class="rating-btn again">Again (0%)</button>
              <button onclick="rateCard('hard')" class="rating-btn hard">Hard (50%)</button>
              <button onclick="rateCard('good')" class="rating-btn good">Good (80%)</button>
              <button onclick="rateCard('easy')" class="rating-btn easy">Easy (100%)</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(studyModal);

    // Add rating functionality
    async function rateCard(rating) {
      const performance = { 'again': 0, 'hard': 0.5, 'good': 0.8, 'easy': 1 }[rating];
      if (performance >= 0.8) {
        correctCount++;
        userStats.correctAnswers++;
        awardPoints(10, 'Correct answer!');
      } else {
        awardPoints(1, 'Keep practicing!');
      }

      userStats.totalFlashcards++;

      // Update flashcard with spaced repetition data
      const updatedCard = calculateNextReview(card, performance);

      await supabase
        .from('flashcards')
        .update({
          easeFactor: updatedCard.easeFactor,
          repetitions: updatedCard.repetitions,
          nextReview: updatedCard.nextReview,
          lastReviewed: new Date().toISOString()
        })
        .eq('id', card.id);

      studyModal.remove();
      currentIndex++;
      showNextCard();
    }
    
    // Make startSpacedRepetition available globally for onclick handlers
    window.startSpacedRepetition = startSpacedRepetition;

    // Make rateCard available globally for onclick handlers
    window.rateCard = rateCard;
  }

  showNextCard();
}

// Load library content (study sets and flashcards)
async function loadLibrary() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Study Sets
  const { data: sets } = await supabase
    .from('study_sets')
    .select('*')
    .eq('user_id', user.id);

  const setsGrid = document.getElementById('setsGrid');
  setsGrid.innerHTML = '';
  if (sets && sets.length > 0) {
    sets.forEach(set => {
      const el = document.createElement('div');
      el.className = 'library-set-card';
      el.innerHTML = `<strong>${set.title}</strong> <span>${set.subject}</span>`;
      setsGrid.appendChild(el);
    });
  } else {
    setsGrid.innerHTML = '<p>No study sets found.</p>';
  }

  // Flashcards
  if (sets && sets.length > 0) {
    const setIds = sets.map(set => set.id);
    const { data: flashcards } = await supabase
      .from('flashcards')
      .select('*')
      .in('study_set_id', setIds);

    const flashGrid = document.getElementById('userFlashcardsGrid');
    flashGrid.innerHTML = '';
    if (flashcards && flashcards.length > 0) {
      flashcards.forEach(card => {
        const el = document.createElement('div');
        el.className = 'library-flashcard';
        el.innerHTML = `<strong>Q:</strong> ${card.question}<br><strong>A:</strong> ${card.answer}`;
        flashGrid.appendChild(el);
      });
    } else {
      flashGrid.innerHTML = '<p>No flashcards found.</p>';
    }
  }
}

function updateUIForAnonymousUser() {
  // Hide user-specific content, show sign-in prompts, etc.
  document.getElementById('authBtn').style.display = 'block';
  document.getElementById('userProfile').classList.add('hidden');
  document.getElementById('authBtn').textContent = 'Sign In';
  // You can hide tabs or sections if needed
}

async function updateUIForAuthenticatedUser() {
  // Show user-specific content, update UI for logged-in user
  document.getElementById('authBtn').style.display = 'none';
  document.getElementById('userProfile').classList.remove('hidden');

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load user profile data - the database trigger should have created this
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile && !error) {
      document.getElementById('userName').textContent = profile.full_name?.split(' ')[0] || 'User';
      document.getElementById('profileFullName').textContent = profile.full_name || '-';
      document.getElementById('profileDateOfBirth').textContent = profile.date_of_birth ?
        new Date(profile.date_of_birth).toLocaleDateString() : '-';
    } else {
      console.log('Profile not found or still being created by trigger:', error);
      // Profile might still be in the process of being created by the trigger
      // This is normal for new signups
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

function getPremiumExpiryDate(planType) {
  const expiryDate = new Date();

  if (planType === 'monthly') {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  } else {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  }

  return expiryDate.toISOString();
}

// Handle hash-based navigation (for footer links and direct URL access)
function handleHashNavigation() {
  // Function to switch to a specific tab
  function switchToTab(tabName) {
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    // Show the target tab pane
    const targetPane = document.getElementById(`${tabName}-tab`);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    // Update navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.tab === tabName) {
        link.classList.add('active');
      }
    });

    // Handle hero section visibility
    const heroSection = document.querySelector('.hero');
    if (heroSection) {
      if (tabName === 'generate') {
        heroSection.style.display = 'block';
      } else {
        heroSection.style.display = 'none';
      }
    }

    // Load data for the tab if needed
    if (tabName === 'study') {
      loadStudySets();
    } else if (tabName === 'saved') {
      loadLibrary();
    } else if (tabName === 'stats') {
      loadAnalytics();
    }

    // Smooth scroll to top for better UX
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Make switchToTab available globally for onclick handlers
  window.switchToTab = switchToTab;

  // Function to handle hash changes
  function handleHashChange() {
    const hash = window.location.hash.substring(1); // Remove the '#'

    // Map hash to tab names
    const hashToTabMap = {
      'generate-tab': 'generate',
      'study-tab': 'study',
      'saved-tab': 'saved',
      'pricing-tab': 'pricing',
      'stats-tab': 'stats'
    };

    const tabName = hashToTabMap[hash];
    if (tabName) {
      switchToTab(tabName);
    }
  }

  // Check for hash on page load
  if (window.location.hash) {
    handleHashChange();
  }

  // Listen for hash changes
  window.addEventListener('hashchange', handleHashChange);

  // Also handle clicks on footer links and other hash links
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      const hash = link.getAttribute('href').substring(1);
      const hashToTabMap = {
        'generate-tab': 'generate',
        'study-tab': 'study',
        'saved-tab': 'saved',
        'pricing-tab': 'pricing',
        'stats-tab': 'stats'
      };

      const tabName = hashToTabMap[hash];
      if (tabName) {
        e.preventDefault();
        // Update URL hash without triggering hashchange
        history.pushState(null, null, `#${hash}`);
        switchToTab(tabName);
      }
    }
  });
}

// Save Modal Functions
function showSaveModal(flashcards) {
  const modal = document.createElement('div');
  modal.className = 'save-modal';
  modal.innerHTML = `
    <div class="save-modal-content">
      <div class="save-modal-icon">💾</div>
      <h3>Save Your Flashcards</h3>
      <p>You have ${flashcards.length} flashcards ready to save. Give your study set a name:</p>
      <input type="text" class="save-modal-input" placeholder="Enter study set name..." id="studySetNameInput">
      <div class="save-modal-buttons">
        <button class="save-modal-btn secondary" onclick="this.closest('.save-modal').remove()">Cancel</button>
        <button class="save-modal-btn primary" onclick="saveFlashcards('${flashcards.length}')">Save Flashcards</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Focus on input
  setTimeout(() => {
    document.getElementById('studySetNameInput').focus();
  }, 100);

  // Handle Enter key
  document.getElementById('studySetNameInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveFlashcards(flashcards.length);
    }
  });
}

async function saveFlashcards(cardCount) {
  const studySetName = document.getElementById('studySetNameInput').value.trim();
  if (!studySetName) {
    alert('Please enter a name for your study set.');
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Please sign in to save your flashcards.');
    showAuthModal();
    return;
  }

  // Get flashcards from the DOM
  const flashcards = [];
  document.querySelectorAll('#flashcardsGrid .flashcard').forEach(cardEl => {
    const question = cardEl.querySelector('p strong') ? cardEl.querySelector('p strong').nextSibling.textContent.trim() : '';
    const answer = cardEl.querySelector('.answer') ? cardEl.querySelector('.answer').textContent.replace('Correct:', '').trim() : '';
    flashcards.push({ question, answer });
  });

  try {
    // Remove modal
    document.querySelector('.save-modal').remove();

    // Show loading
    showLoading('Saving flashcards...');

    // First create a study set
    const studySetData = {
      user_id: user.id,
      title: studySetName,
      subject: 'Generated Flashcards',
      description: `Auto-generated flashcards from text (${flashcards.length} cards)`
    };

    const { data: studySet, error: setError } = await supabase
      .from('study_sets')
      .insert([studySetData])
      .select()
      .single();

    if (setError) throw setError;

    // Then save flashcards to the study set using the API
    const { error: cardsError } = await supabase
      .from('flashcards')
      .insert(flashcards.map(card => ({
        study_set_id: studySet.id,
        question: card.question,
        answer: card.answer
      })));

    if (cardsError) throw cardsError;

    hideLoading();

    // Show success notification
    showSuccessNotification(`Successfully saved ${flashcards.length} flashcards to "${studySetName}"!`);

    // Award points for saving
    awardPoints(20, 'Flashcards saved to library!');

  } catch (error) {
    console.error('Error saving flashcards:', error);
    hideLoading();
    alert('Error saving flashcards. Please try again.');
  }
}

// Make saveFlashcards available globally for onclick handlers
window.saveFlashcards = saveFlashcards;

function showSuccessNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'success-notification';
  notification.innerHTML = `
    <div class="success-notification-content">
      <div class="success-notification-icon">✅</div>
      <div class="success-notification-text">
        <h4>Success!</h4>
        <p>${message}</p>
      </div>
    </div>
  `;
  document.body.appendChild(notification);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

// Make showSuccessNotification available globally for onclick handlers
window.showSuccessNotification = showSuccessNotification;

// Quick Review and New Set Functions
function startQuickReview() {
  const { data: { user } } = supabase.auth.getUser();
  if (!user) {
    alert('Please sign in to start a quick review.');
    showAuthModal();
    return;
  }

  // Get all user's flashcards for quick review
  loadStudySets().then(() => {
    // Switch to study tab
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('study-tab').classList.add('active');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('.nav-link[data-tab="study"]').classList.add('active');

    showSuccessNotification('Quick review started! Select a study set to begin.');
    });
  }
  
  // Make startQuickReview available globally for onclick handlers
  window.startQuickReview = startQuickReview;

function createNewSet() {
  // Switch to generate tab
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('generate-tab').classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector('.nav-link[data-tab="generate"]').classList.add('active');

  // Scroll to input area
  setTimeout(() => {
    document.querySelector('.notes-input').scrollIntoView({ behavior: 'smooth' });
    document.querySelector('.notes-input').focus();
  }, 300);

  showSuccessNotification('Ready to create new flashcards! Enter your study material below.');
}

// Make createNewSet available globally for onclick handlers
window.createNewSet = createNewSet;

// Update study time display
function updateStudyTimeDisplay() {
  const studyTime = Math.floor(Math.random() * 120) + 10; // Simulated study time
  const studyTimeDisplay = document.getElementById('studyTimeDisplay');
  if (studyTimeDisplay) {
    studyTimeDisplay.textContent = studyTime;
  }
}

// Initialize study time display
setTimeout(updateStudyTimeDisplay, 1000);

// Gamification System
let userStats = {
  points: 0,
  streak: 0,
  totalFlashcards: 0,
  correctAnswers: 0,
  achievements: []
};

function initializeGamification() {
  // Load user stats from localStorage
  const savedStats = localStorage.getItem('userStats');
  if (savedStats) {
    userStats = JSON.parse(savedStats);
  }
  updateStatsDisplay();
}

function awardPoints(points, reason) {
  userStats.points += points;
  showPointsNotification(points, reason);
  checkAchievements();
  saveUserStats();
  updateStatsDisplay();
}

function showPointsNotification(points, reason) {
  const notification = document.createElement('div');
  notification.className = 'points-notification';
  notification.innerHTML = `
    <div class="points-content">
      <span class="points-amount">+${points} points</span>
      <span class="points-reason">${reason}</span>
    </div>
  `;
  document.body.appendChild(notification);

  // Animate and remove
  setTimeout(() => {
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }, 100);
}

function checkAchievements() {
  const achievements = [
    { id: 'first-card', name: 'First Steps', requirement: userStats.totalFlashcards >= 1, points: 10 },
    { id: 'study-streak', name: 'Consistent Learner', requirement: userStats.streak >= 7, points: 50 },
    { id: 'perfect-score', name: 'Perfectionist', requirement: userStats.correctAnswers >= 10, points: 100 },
    { id: 'ai-generator', name: 'AI Master', requirement: userStats.totalFlashcards >= 50, points: 200 }
  ];

  achievements.forEach(achievement => {
    if (achievement.requirement && !userStats.achievements.includes(achievement.id)) {
      userStats.achievements.push(achievement.id);
      showAchievementNotification(achievement);
      awardPoints(achievement.points, `Achievement: ${achievement.name}`);
    }
  });
}

function showAchievementNotification(achievement) {
  const notification = document.createElement('div');
  notification.className = 'achievement-notification';
  notification.innerHTML = `
    <div class="achievement-content">
      <div class="achievement-icon">🏆</div>
      <div class="achievement-details">
        <h4>Achievement Unlocked!</h4>
        <p>${achievement.name}</p>
        <span class="achievement-points">+${achievement.points} points</span>
      </div>
    </div>
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }, 100);
}

function saveUserStats() {
  localStorage.setItem('userStats', JSON.stringify(userStats));
}

function updateStatsDisplay() {
  // Update points display in header
  const pointsDisplay = document.getElementById('pointsDisplay');
  if (pointsDisplay) {
    pointsDisplay.textContent = userStats.points;
  }

  // Update streak display
  const streakDisplay = document.getElementById('streakDisplay');
  if (streakDisplay) {
    streakDisplay.textContent = userStats.streak;
  }
}

// Theme Management Functions
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

// PWA Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    // Try to register service worker, but don't fail if it's not available
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('Service Worker registered successfully:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                showUpdateNotification();
              }
            });
          }
        });
      })
      .catch(error => {
        console.log('Service Worker registration skipped:', error.message);
        // Don't show error to user, PWA features just won't work
      });
  }
}

function showUpdateNotification() {
  // Create update notification
  const notification = document.createElement('div');
  notification.className = 'update-notification';
  notification.innerHTML = `
    <div class="update-content">
      <p>🎉 New version available!</p>
      <button onclick="window.location.reload()">Update Now</button>
      <button onclick="this.parentElement.parentElement.remove()">Later</button>
    </div>
  `;
  document.body.appendChild(notification);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 10000);
}

// Check if app is installed
function checkInstallPrompt() {
  let deferredPrompt;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;

    // Show install button
    showInstallButton(deferredPrompt);
  });

  // Check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('App is already installed');
  }
}

function showInstallButton(deferredPrompt) {
  const installBtn = document.createElement('button');
  installBtn.className = 'install-btn';
  installBtn.innerHTML = '📱 Install App';
  installBtn.onclick = () => {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      installBtn.remove();
      deferredPrompt = null;
    });
  };

  document.querySelector('.header-actions').appendChild(installBtn);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  console.log('Toggling theme from', currentTheme, 'to', newTheme);

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  // Update toggle button icons
  const moonIcon = document.querySelector('#themeToggle .ri-moon-line');
  const sunIcon = document.querySelector('#themeToggle .ri-sun-line');

  if (moonIcon && sunIcon) {
    if (newTheme === 'dark') {
      moonIcon.style.display = 'none';
      sunIcon.style.display = 'inline';
    } else {
      moonIcon.style.display = 'inline';
      sunIcon.style.display = 'none';
    }
  }
}
