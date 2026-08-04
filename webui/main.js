import { exec } from 'kernelsu';

const CONFIG_PATH = "/data/local/tmp/re.zyg.fri/config.json";

let apps = [];
let appLabels = {};
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
    const shimCmd = `app_process -Djava.class.path=/data/local/tmp/re.zyg.fri/shim.dex /system/bin re.zyg.fri.LabelShim`;
    const { errno, stdout } = await exec(shimCmd);
    
    if (errno === 0 && stdout.trim().startsWith('{')) {
      appLabels = JSON.parse(stdout);
      apps = Object.keys(appLabels);
      return;
    }
  } catch (e) {
    console.error("Shim failed, falling back", e);
  }

  try {
    const { errno, stdout, stderr } = await exec('pm list packages -3');
    if (errno === 0) {
      const packages = stdout.split('\n')
        .filter(line => line.startsWith('package:'))
        .map(line => line.replace('package:', '').trim());
      apps = packages;
      apps.forEach(pkg => appLabels[pkg] = pkg);
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
    (appLabels[app] || app).toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (filteredApps.length === 0) {
    appListEl.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted)">No apps found</div>`;
    return;
  }
  
  // Sort enabled items to top, then alphabetically
  filteredApps.sort((a, b) => {
    const aEnabled = currentConfig.targets.some(t => t.app_name === a && t.enabled);
    const bEnabled = currentConfig.targets.some(t => t.app_name === b && t.enabled);
    if (aEnabled && !bEnabled) return -1;
    if (!aEnabled && bEnabled) return 1;
    return (appLabels[a] || a).toLowerCase().localeCompare((appLabels[b] || b).toLowerCase());
  });

  const fragment = document.createDocumentFragment();
  
  // Provide a generic fallback SVG if the ksu://icon fails or is unavailable
  const fallbackIcon = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOGI5MmE1IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48bGluZSB4MT0iOSIgeTE9IjMiIHgyPSI5IiB5Mj0iMjEiPjwvbGluZT48L3N2Zz4=";

  filteredApps.forEach(pkgName => {
    const isEnabled = currentConfig.targets.some(
      t => t.app_name === pkgName && t.enabled
    );
    const label = appLabels[pkgName] || pkgName;
    
    const appEl = document.createElement("div");
    appEl.className = "app-item";
    
    appEl.innerHTML = `
      <div class="app-info">
        <img src="ksu://icon/${pkgName}" width="40" height="40" class="app-icon" onerror="this.src='${fallbackIcon}'">
        <div class="app-details">
          <div class="app-name" title="${label}">${label}</div>
          <div class="app-pkg" title="${pkgName}">${pkgName}</div>
        </div>
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
