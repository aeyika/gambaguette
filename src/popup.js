import { settings } from './core.js';
import { icons } from 'gambaguette:icons';
for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = icons[element.dataset.icon];
const checkbox = document.querySelector('#enabled');
const autoSide = document.querySelector('#auto-side');
const color = document.querySelector('#arrow-color');
const themeLabel = document.createElement('label');
themeLabel.innerHTML = `<span>${icons.moon}Dark mode</span><input id="dark-mode" type="checkbox">`;
document.querySelector('section').append(themeLabel);
const darkMode = document.querySelector('#dark-mode');
const privateLabel = document.createElement('label');
privateLabel.innerHTML = `<span>${icons.private}Private overlay</span><input id="private-overlay" type="checkbox">`;
document.querySelector('section').append(privateLabel);
const privateOverlay=document.querySelector('#private-overlay');
const setup=document.createElement('div');setup.id='helper-setup';
setup.innerHTML='<p>Windows helper required for capture exclusion.</p><button id="copy-helper-command">Copy setup command</button><p id="helper-state"></p>';
privateLabel.after(setup);
document.querySelector('#copy-helper-command').addEventListener('click',async () => {
  await navigator.clipboard.writeText(`node scripts/helper.mjs install ${chrome.runtime.id}`);
  document.querySelector('#helper-state').textContent='Run the copied command from the project folder, then enable Private overlay.';
});
const {settings:stored} = await chrome.storage.local.get('settings');
const sync = value => {
  const prefs = settings(value);
  checkbox.checked = prefs.enabled; autoSide.checked = prefs.autoSide; color.value = prefs.arrowColor;
  darkMode.checked = prefs.darkMode;
  document.documentElement.dataset.theme = prefs.darkMode ? 'dark' : 'light';
  privateOverlay.checked=prefs.privateOverlay;
};
sync(stored);
async function save(patch,message) {
  const value = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({settings:{...settings(value.settings),...patch}});
  document.querySelector('#status').textContent = message;
}
checkbox.addEventListener('change', () => save({enabled:checkbox.checked},checkbox.checked ? 'Hints enabled.' : 'Hints paused.'));
autoSide.addEventListener('change', () => save({autoSide:autoSide.checked},autoSide.checked ? 'Automatic side detection enabled.' : 'Using the manual side setting.'));
color.addEventListener('input', () => save({arrowColor:color.value},'Arrow colour saved.'));
darkMode.addEventListener('change', () => save({darkMode:darkMode.checked},darkMode.checked ? 'Dark mode enabled.' : 'Light mode enabled.'));
privateOverlay.addEventListener('change',async () => {
  privateOverlay.disabled=true;
  try {
    if (privateOverlay.checked) {
      const result=await chrome.runtime.sendMessage({target:'overlay',action:'status',connect:true});
      if (!result?.ready) {
        privateOverlay.checked=false;
        document.querySelector('#helper-state').textContent=result?.error || 'Windows helper unavailable.';
        return;
      }
      document.querySelector('#helper-state').textContent='Capture exclusion active. Configure settings before recording.';
    }
    await save({privateOverlay:privateOverlay.checked},privateOverlay.checked ? 'Windows private overlay enabled.' : 'Browser overlay enabled.');
  } catch(error) {privateOverlay.checked=false;document.querySelector('#helper-state').textContent=error.message;}
  finally {privateOverlay.disabled=false;}
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === 'local' && changes.settings) sync(changes.settings.newValue);
});
