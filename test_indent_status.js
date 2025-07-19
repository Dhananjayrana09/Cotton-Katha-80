const axios = require('axios');

// Test the new indent status endpoint
async function testIndentStatus() {
  try {
    console.log('Testing indent status endpoint...');
    
    // You'll need to replace this with a valid JWT token from your auth system
    const token = 'your-jwt-token-here';
    
    const response = await axios.get('http://localhost:3001/api/contract/indent-status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ API Response:', response.data);
    console.log('✅ Total indents:', response.data.data.total_indents);
    console.log('✅ Pending contracts:', response.data.data.pending_contracts);
    console.log('✅ Uploaded contracts:', response.data.data.uploaded_contracts);
    
  } catch (error) {
    console.error('❌ Error testing API:', error.response?.data || error.message);
  }
}

testIndentStatus(); 