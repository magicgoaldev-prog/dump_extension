// Load snapshot and display original as is in index.html (Archive project method)
(async function() {
  try {
    // Get snapshot from chrome.storage
    const result = await chrome.storage.local.get(['snapshot']);
    
    if (result.snapshot) {
      // Archive project method: replace entire HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(result.snapshot, 'text/html');
      
      // Update title
      if (doc.querySelector('title')) {
        document.title = doc.querySelector('title').textContent;
      }
      
      // Replace entire body (Archive method)
      if (doc.body) {
        // Remove existing head styles
        const existingStyles = document.head.querySelectorAll('style, link[rel="stylesheet"]');
        existingStyles.forEach(style => style.remove());
        
        // Add snapshot styles
        const snapshotStyles = doc.head.querySelectorAll('style, link[rel="stylesheet"]');
        snapshotStyles.forEach(style => {
          document.head.appendChild(style.cloneNode(true));
        });
        
        // Replace entire body (Archive method)
        const newBody = doc.body.cloneNode(true);
        document.body.parentNode.replaceChild(newBody, document.body);
      }
      
      // Don't clean up storage after loading snapshot (keep for preservation)
      console.log('[mBank Snapshot] Snapshot loaded into index.html');
    } else {
      document.body.innerHTML = '<div style="padding: 20px; text-align: center;">No snapshot available.</div>';
    }
  } catch (error) {
    console.error('Error loading snapshot:', error);
    document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Error occurred while loading snapshot.</div>';
  }
})();