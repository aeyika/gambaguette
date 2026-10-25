import { settings } from './core.js';
import { icons } from 'gambaguette:icons';
for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = icons[element.dataset.icon];
const checkbox = document.querySelector('#enabled');
const autoSide = document.querySelector('#auto-side');
const color = document.querySelector('#arrow-color');
const {settings:stored} = await chrome.storage.local.get('settings');
const sync = value => {
  const prefs = settings(value);
  checkbox.checked = prefs.enabled; autoSide.checked = prefs.autoSide; color.value = prefs.arrowColor;
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
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === 'local' && changes.settings) sync(changes.settings.newValue);
});
