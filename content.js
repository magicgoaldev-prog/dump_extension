(async function () {
    console.log("[mBank Snapshot] loaded");
  
    async function fetchCSS(url) {
      try {
        const absoluteUrl = new URL(url, window.location.href).href;
        // Set timeout (5 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(absoluteUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return await response.text();
        }
      } catch (e) {
        console.warn("[mBank Snapshot] Failed to fetch CSS:", url, e.message);
      }
      return "";
    }

    function convertCSSUrlsToAbsolute(cssText, baseUrl) {
      // Convert url() references in CSS to absolute URLs
      const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
      
      return cssText.replace(urlRegex, (match, url) => {
        // Keep as is if already absolute URL or data/blob URL
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
          return match;
        }
        
        try {
          // Convert relative URL to absolute URL
          const absoluteUrl = new URL(url, baseUrl).href;
          return match.replace(url, absoluteUrl);
        } catch (e) {
          // Keep original if conversion fails
          return match;
        }
      });
    }

    async function collectCSS() {
      let css = "";
      const processedUrls = new Set(); // Prevent duplicates
      
      // 1. Fetch CSS files from all <link rel="stylesheet"> tags
      const linkTags = document.querySelectorAll('link[rel="stylesheet"]');
      console.log("[mBank Snapshot] Found", linkTags.length, "stylesheet links");
      
      for (let i = 0; i < linkTags.length; i++) {
        const link = linkTags[i];
        if (link.href && !processedUrls.has(link.href)) {
          processedUrls.add(link.href);
          console.log(`[mBank Snapshot] Fetching CSS ${i+1}/${linkTags.length}:`, link.href);
          try {
            const cssText = await fetchCSS(link.href);
            if (cssText) {
              // Convert url() references to absolute URLs
              const converted = convertCSSUrlsToAbsolute(cssText, link.href);
              css += converted + "\n";
            }
          } catch (e) {
            console.warn("[mBank Snapshot] Failed to process CSS:", link.href, e);
          }
        }
      }
      
      // 2. Collect content from all <style> tags
      const styleTags = document.querySelectorAll("style");
      for (const styleTag of styleTags) {
        let styleText = styleTag.textContent;
        // Convert url() references to absolute URLs
        styleText = convertCSSUrlsToAbsolute(styleText, window.location.href);
        css += styleText + "\n";
      }
      
      // 3. Collect CSS rules from all stylesheets (additional coverage)
      for (const sheet of document.styleSheets) {
        try {
          if (sheet.cssRules) {
            for (const rule of sheet.cssRules) {
              if (rule.type === CSSRule.IMPORT_RULE) {
                // @import already handled by link tags
                continue;
              } else {
                let ruleText = rule.cssText;
                // Convert url() references to absolute URLs
                if (sheet.href) {
                  ruleText = convertCSSUrlsToAbsolute(ruleText, sheet.href);
                } else {
                  ruleText = convertCSSUrlsToAbsolute(ruleText, window.location.href);
                }
                css += ruleText + "\n";
              }
            }
          }
        } catch (e) {
          // Ignore cross-origin stylesheets (already handled by link tags)
        }
      }
      
      console.log("[mBank Snapshot] CSS collected, length:", css.length);
      return `<style>${css}</style>`;
    }
  
    async function inlineResource(url) {
      try {
        const absoluteUrl = new URL(url, window.location.href).href;
        const res = await fetch(absoluteUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        const base64 = await new Promise(r => {
          reader.onload = () => r(reader.result);
          reader.readAsDataURL(blob);
        });
        return base64;
      } catch (e) {
        return null;
      }
    }

    async function inlineImages(html) {
      // 1. Process src and srcset of <img> tags
      const imgs = [...document.images];
      for (const img of imgs) {
        if (img.src) {
          const base64 = await inlineResource(img.src);
          if (base64) {
            html = html.split(img.src).join(base64);
          }
        }
        // Process srcset
        if (img.srcset) {
          const srcsetUrls = img.srcset.split(',').map(s => s.trim().split(' ')[0]);
          for (const url of srcsetUrls) {
            const base64 = await inlineResource(url);
            if (base64) {
              html = html.split(url).join(base64);
            }
          }
        }
      }
      
      // 2. Process CSS background images (already handled during CSS collection)
      
      // 3. Process icons etc. from <link> tags
      const links = document.querySelectorAll('link[href]');
      for (const link of links) {
        if (link.rel === 'icon' || link.rel === 'shortcut icon' || link.rel === 'apple-touch-icon') {
          const base64 = await inlineResource(link.href);
          if (base64) {
            html = html.split(link.href).join(base64);
          }
        }
      }
      
      return html;
    }
  
    function stripScripts(html) {
      return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
    }

    function stripLinkTags(html) {
      // Remove <link rel="stylesheet"> tags (CSS already included inline)
      return html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "");
    }
  
    async function buildSnapshot() {
      console.log("[mBank Snapshot] building index.html");
  
      // Get HTML before removing scripts
      let html = document.documentElement.outerHTML;
  
      // Collect CSS (before removing scripts)
      console.log("[mBank Snapshot] collecting CSS...");
      const css = await collectCSS();
      
      // Remove scripts
      html = stripScripts(html);
      
      // Remove link tags (CSS already included inline)
      html = stripLinkTags(html);
      
      // Insert CSS into head
      if (html.includes("</head>")) {
        html = html.replace("</head>", `${css}</head>`);
      } else if (html.includes("<head>")) {
        html = html.replace("<head>", `<head>${css}`);
      } else {
        // Create head if it doesn't exist
        html = html.replace("<html", `<head>${css}</head><html`);
      }
  
      // Skip image/font inlining (CSS only)
      console.log("[mBank Snapshot] skipping image/font inlining (CSS only)");
  
      return "<!DOCTYPE html>\n" + html;
    }
  
    async function waitForPageLoad() {
      // Wait until DOM stabilizes (until no changes occur)
      await new Promise(resolve => {
        let timeout;
        const observer = new MutationObserver(() => {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            observer.disconnect();
            resolve();
          }, 1000); // Consider stabilized if no changes for 1 second
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
        
        // Initial wait
        timeout = setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 1000);
      });
      
      // Wait until all images are loaded
      const images = [...document.images];
      await Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            // Timeout after maximum 5 seconds
            setTimeout(resolve, 5000);
          });
        })
      );
      
      // Final stabilization wait
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  
    function downloadHTML(html, filename) {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    async function dumpAndRedirect() {
      try {
        console.log("[mBank Snapshot] button clicked, starting...");
        console.log("[mBank Snapshot] waiting for page to load...");
        await waitForPageLoad();
        
        console.log("[mBank Snapshot] building snapshot...");
        const snapshot = await buildSnapshot();
        console.log("[mBank Snapshot] snapshot built, size:", snapshot.length);
    
        // Save as HTML file locally
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const filename = `mbank-snapshot-${timestamp}.html`;
        console.log("[mBank Snapshot] downloading:", filename);
        downloadHTML(snapshot, filename);
        console.log("[mBank Snapshot] downloaded:", filename);
    
        // Save snapshot to chrome.storage
        await chrome.storage.local.set({ snapshot: snapshot });
        console.log("[mBank Snapshot] snapshot saved to storage");
    
        // Archive project method: replace entire HTML to display original as is
        const parser = new DOMParser();
        const doc = parser.parseFromString(snapshot, 'text/html');
        
        // Update title
        if (doc.querySelector('title')) {
          document.title = doc.querySelector('title').textContent;
        }
        
        // Replace entire body (Archive method)
        const container = document.createElement('div');
        container.innerHTML = snapshot;
        
        // Keep existing head but add snapshot styles
        const existingStyles = document.head.querySelectorAll('style, link[rel="stylesheet"]');
        existingStyles.forEach(style => style.remove());
        
        const snapshotStyles = doc.head.querySelectorAll('style, link[rel="stylesheet"]');
        snapshotStyles.forEach(style => {
          document.head.appendChild(style.cloneNode(true));
        });
        
        // Replace entire body
        if (doc.body) {
          // Archive method: use body.parentNode.replaceChild
          const newBody = doc.body.cloneNode(true);
          document.body.parentNode.replaceChild(newBody, document.body);
        }
        
        console.log("[mBank Snapshot] snapshot loaded, URL unchanged");
      } catch (error) {
        console.error("[mBank Snapshot] Error:", error);
        alert("Error occurred while creating snapshot: " + error.message);
      }
    }
  
    function hookButton() {
      const btn = document.getElementById("liv-filter-action");
      if (!btn || btn.__hooked) return;
  
      btn.__hooked = true;
      console.log("[mBank Snapshot] liv-filter-action hooked");
  
      btn.addEventListener("click", (e) => {
        console.log("[mBank Snapshot] Button clicked!");
        // Allow default action and create snapshot in background
        dumpAndRedirect().catch(err => {
          console.error("[mBank Snapshot] Unhandled error:", err);
          alert("Error occurred while creating snapshot: " + err.message);
        });
      }, true); // capture phase
    }
  
    const observer = new MutationObserver(hookButton);
    observer.observe(document, { childList: true, subtree: true });
  
    hookButton();
  })();