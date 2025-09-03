import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper functions
export const studySetAPI = {
  // Get all study sets for the current user
  async getStudySets() {
    // Check if user is authenticated first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return []
    }
    
    const { data, error } = await supabase
      .from('study_sets')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching study sets:', error)
      throw error
    }
    return data
  },

  // Create a new study set
  async createStudySet(setData) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User must be authenticated to create study sets')
    }
    
    const { data, error } = await supabase
      .from('study_sets')
      .insert([{ ...setData, user_id: user.id }])
      .select()
    
    if (error) {
      console.error('Error creating study set:', error)
      throw error
    }
    return data[0]
  },

  // Update a study set
  async updateStudySet(id, updates) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User must be authenticated to update study sets')
    }
    
    const { data, error } = await supabase
      .from('study_sets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user owns this study set
      .select()
    
    if (error) {
      console.error('Error updating study set:', error)
      throw error
    }
    return data[0]
  },

  // Delete a study set
  async deleteStudySet(id) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User must be authenticated to delete study sets')
    }
    
    const { error } = await supabase
      .from('study_sets')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user owns this study set
    
    if (error) {
      console.error('Error deleting study set:', error)
      throw error
    }
  }
}

export const flashcardAPI = {
  // Get all flashcards for a study set
  async getFlashcards(studySetId) {
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('study_set_id', studySetId)
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('Error fetching flashcards:', error)
      throw error
    }
    return data
  },

  // Create multiple flashcards
  async createFlashcards(cards) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User must be authenticated to create flashcards')
    }
    
    const { data, error } = await supabase
      .from('flashcards')
      .insert(cards)
      .select()
    
    if (error) {
      console.error('Error creating flashcards:', error)
      throw error
    }
    return data
  },

  // Update a flashcard
  async updateFlashcard(id, updates) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User must be authenticated to update flashcards')
    }
    
    const { data, error } = await supabase
      .from('flashcards')
      .update(updates)
      .eq('id', id)
      .select()
    
    if (error) {
      console.error('Error updating flashcard:', error)
      throw error
    }
    return data[0]
  },

  // Delete a flashcard
  async deleteFlashcard(id) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('User must be authenticated to delete flashcards')
    }
    
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting flashcard:', error)
      throw error
    }
  }
}

export const userAPI = {
  // Get user profile
  async getProfile() {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error:', authError)
      return null
    }
    
    if (!user) return null
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (error) {
      console.error('Error fetching profile:', error)
      throw error
    }
    return data
  },

  // Update user profile
  async updateProfile(updates) {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('Auth error:', authError)
      throw new Error('Not authenticated')
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
    
    if (error) {
      console.error('Error updating profile:', error)
      throw error
    }
    return data[0]
  }
}
