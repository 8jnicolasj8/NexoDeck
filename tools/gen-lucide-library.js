const fs = require('fs');
const path = require('path');
const dir = path.join('web','node_modules','lucide-react','dist','esm','icons');
const names = new Set(`mic mic-off play pause skip-forward skip-back volume volume-1 volume-2 volume-x headphones camera monitor activity terminal code lock lock-open music save power globe plus x rotate-cw rotate-ccw bookmark download eye eye-off chevron-left chevron-right clock zoom-in zoom-out copy video keyboard type app-window scissors clipboard-paste clipboard-type text-cursor-input folder pin circle square minimize maximize search settings trash-2 pencil check arrow-left arrow-right arrow-up arrow-down house user users wifi bluetooth battery battery-charging sun moon star heart file file-text folder-open image film map mail message-circle bell calendar credit-card cpu database hard-drive server shield smartphone tablet laptop printer gamepad-2 wrench hammer palette pipette brush crop layers layout-grid list menu ellipsis ellipsis-vertical external-link link unlink refresh-cw refresh-ccw repeat shuffle rewind fast-forward circle-play circle-pause circle-stop radio podcast disc album tv airplay cast projector screen-share video-off gauge thermometer fan wind droplet flame cloud cloud-rain zap plug power-off timer alarm-clock watch hourglass send inbox archive box package truck shopping-cart tag percent dollar-sign euro gift award trophy target compass navigation map-pin flag book-open newspaper rss at-sign hash quote bold italic underline strikethrough align-left align-center align-right align-justify indent-increase indent-decrease text heading heading-1 heading-2 heading-3 heading-4 list-ordered list-checks square-check git-branch git-merge git-pull-request github gitlab figma chrome`.split(/\s+/).filter(Boolean));
const wanted = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = src.match(/createLucideIcon\("([^"]+)",\s*(\[[\s\S]*?\])\s*\);/);
  if (!m) continue;
  const kebab = m[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').replace(/([a-z])(\d)/g, '$1-$2').toLowerCase();
  if (!names.has(kebab) && !names.has(m[1].toLowerCase())) continue;
  let nodes;
  try { nodes = new Function("return " + m[2])(); } catch (e) { console.error('parse fail', f, e.message); continue; }
  const cleaned = nodes.map(([tag, attrs]) => {
    const keep = {};
    for (const k of ['d','cx','cy','r','x1','y1','x2','y2','width','height','points','x','y','rx','ry','transform']) {
      if (attrs[k] !== undefined) keep[k] = attrs[k];
    }
    return [tag, keep];
  });
  wanted.push([kebab, cleaned]);
}
wanted.sort((a,b)=>a[0].localeCompare(b[0]));
const out = `/* Lucide icon paths (v0.454.0, ISC) for the panel icon library. Generated subset. */\nwindow.LUCIDE_LIBRARY = ${JSON.stringify(Object.fromEntries(wanted))};\n`;
fs.writeFileSync(path.join('server','src','NexoDeck.Server','wwwroot','lucideLibrary.js'), out);
console.log('icons:', wanted.length, 'bytes:', out.length);
const missing = [...names].filter(n => !wanted.some(([k])=>k===n));
console.log('missing:', missing.join(' '));


