export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        assistant: {
          ink: '#333333',
          muted: '#888888',
          line: '#E7E8EF',
          surface: '#FFFFFF',
          wash: '#F5F6FA',
          accent: '#6C63FF',
          success: '#4CAF50',
          warning: '#FF9800'
        }
      },
      boxShadow: {
        utility: '0 10px 30px rgba(27, 31, 59, 0.14)'
      }
    }
  },
  plugins: []
};
