import { exec } from 'kernelsu';

const CONFIG_PATH = "/data/local/tmp/re.zyg.fri/config.json";

let apps = [];
let currentConfig = { targets: [] };
let searchTerm = "";

const appListEl = document.getElementById("app-list");
const searchInput = document.getElementById("search-input");
const statusText = document.getElementById("status-text");
const statusDot = document.querySelector(".status-indicator .dot");

function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function setStatus(text, type = "connected") {
  statusText.textContent = text;
  statusDot.className = `dot ${type}`;
}

async function getInstalledApps() {
  setStatus("Fetching apps...", "connected");
  try {
    const { errno, stdout, stderr } = await exec('pm list packages -3');
    if (errno === 0) {
      const packages = stdout.split('\n')
        .filter(line => line.startsWith('package:'))
        .map(line => line.replace('package:', '').trim())
        .sort();
      apps = packages;
    } else {
      console.error("pm error:", stderr);
      showToast("Error fetching apps");
    }
  } catch (e) {
    console.error("Exec failed", e);
    showToast("Requires root/KernelSU environment");
    setStatus("Environment Error", "error");
  }
}

async function loadConfig() {
  setStatus("Loading config...", "connected");
  try {
    const { errno, stdout } = await exec(`cat ${CONFIG_PATH}`);
    if (errno === 0 && stdout.trim() !== '') {
      try {
        currentConfig = JSON.parse(stdout);
      } catch (e) {
        console.error("Parse error:", e);
        showToast("Error parsing config file");
      }
    }
  } catch (e) {
    console.error("Load config failed", e);
  }
}

function sanitizePackageName(pkgName) {
  // Ensure valid android package name structure to prevent injection
  if (!/^[a-zA-Z0-9_\.]+$/.test(pkgName)) {
    throw new Error("Invalid package name");
  }
  return pkgName;
}

async function saveConfig() {
  setStatus("Saving...", "connected");
  try {
    const jsonString = JSON.stringify(currentConfig, null, 4);
    
    // Safer injection: use Base64 to bypass heredoc EOF collision risks
    // btoa handles ascii well, which package names and paths consist of.
    // For full unicode safety in JS btoa:
    const base64Str = btoa(unescape(encodeURIComponent(jsonString)));
    
    // Execute decode and write
    const command = `echo '${base64Str}' | base64 -d > ${CONFIG_PATH}`;
    const { errno, stderr } = await exec(command);
    
    if (errno === 0) {
      showToast("Configuration saved!");
    } else {
      console.error("Save config error:", stderr);
      showToast("Error saving config");
    }
  } catch (e) {
    console.error("Save failed", e);
    showToast("Exception while saving");
  }
  setStatus("Active", "connected");
}

function render() {
  appListEl.innerHTML = "";
  
  const filteredApps = apps.filter(app => 
    app.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (filteredApps.length === 0) {
    appListEl.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted)">No apps found</div>`;
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  filteredApps.forEach(pkgName => {
    const isEnabled = currentConfig.targets.some(
      t => t.app_name === pkgName && t.enabled
    );
    
    const appEl = document.createElement("div");
    appEl.className = "app-item";
    
    appEl.innerHTML = `
      <div class="app-info">
        <div class="app-name">${pkgName}</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${isEnabled ? "checked" : ""} data-pkg="${pkgName}">
        <span class="slider"></span>
      </label>
    `;
    
    const checkbox = appEl.querySelector("input");
    checkbox.addEventListener("change", (e) => {
      handleToggle(pkgName, e.target.checked);
    });
    
    fragment.appendChild(appEl);
  });
  
  appListEl.appendChild(fragment);
}

async function handleToggle(pkgName, isEnabled) {
  try {
    const sanitizedPkg = sanitizePackageName(pkgName);
    
    if (!currentConfig.targets) {
      currentConfig.targets = [];
    }
    
    let target = currentConfig.targets.find(t => t.app_name === sanitizedPkg);
    
    if (isEnabled) {
      if (target) {
        target.enabled = true;
      } else {
        // Push default configuration
        currentConfig.targets.push({
          app_name: sanitizedPkg,
          enabled: true,
          start_up_delay_ms: 0,
          injected_libraries: [
            {
              path: "/data/local/tmp/re.zyg.fri/libgadget.so"
            }
          ]
        });
      }
    } else {
      if (target) {
        target.enabled = false;
        // Or optionally completely remove:
        // currentConfig.targets = currentConfig.targets.filter(t => t.app_name !== sanitizedPkg);
      }
    }
    
    await saveConfig();
  } catch (e) {
    console.error("Invalid action:", e);
    showToast(e.message || "Invalid package");
  }
}

async function init() {
  await getInstalledApps();
  await loadConfig();
  
  if (apps.length > 0) {
    setStatus("Active", "connected");
  }
  
  render();
  
  searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    render();
  });
}

// Start app
init();
