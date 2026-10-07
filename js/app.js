/* =========================================================================
   PCB & Breadboard Designer — full standalone logic
   ========================================================================= */
(function(){
"use strict";

/* ---------------------------------------------------------------------
   0. UTILITIES
--------------------------------------------------------------------- */
function uid(prefix){ return prefix+'_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function keyOf(c,r){ return c+','+r; }
function escapeXml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const RAND_COLORS = ['#e0524a','#3763e8','#1f9e6d','#e08a2c','#8c4fd6','#0fa3b1','#d6458c','#5c7a1f','#c9982c','#2c7be0','#c02f60','#188a63'];
function randomWireColor(){ return RAND_COLORS[Math.floor(Math.random()*RAND_COLORS.length)]; }

/* Union-Find */
function UnionFind(){
  this.parent = new Map();
}
UnionFind.prototype.find = function(x){
  if(!this.parent.has(x)) this.parent.set(x,x);
  let root = x;
  while(this.parent.get(root) !== root) root = this.parent.get(root);
  let cur = x;
  while(this.parent.get(cur) !== root){ const next = this.parent.get(cur); this.parent.set(cur,root); cur = next; }
  return root;
};
UnionFind.prototype.union = function(a,b){
  const ra=this.find(a), rb=this.find(b);
  if(ra!==rb) this.parent.set(ra,rb);
};

/* ---------------------------------------------------------------------
   1. STANDARD FOOTPRINT LIBRARY
   Each footprint: {id,name,pins:[{name,number,dx,dy}], bodyPad(cells), kind}
   dx,dy are grid units from the origin (reference pin = logical top-left corner)
--------------------------------------------------------------------- */
function dipFootprint(id,name,n){
  const perSide = n/2;
  const pins=[];
  // Standard DIP numbering: pin 1 top-left, down the left side then up the right side
  for(let i=0;i<perSide;i++) pins.push({name:String(i+1), dx:0, dy:i});
  for(let i=0;i<perSide;i++) pins.push({name:String(n-i), dx:1, dy:i});
  return {id,name,pins,rowGapUnits:1,pitchUnits:1,kind:'dip', bodyPad:0.35};
}
function headerFootprint(id,name,n,rows){
  const pins=[];
  if(rows===1){
    for(let i=0;i<n;i++) pins.push({name:String(i+1), dx:i, dy:0});
  } else {
    for(let i=0;i<n;i++) pins.push({name:'T'+(i+1), dx:i, dy:0});
    for(let i=0;i<n;i++) pins.push({name:'B'+(i+1), dx:i, dy:1});
  }
  return {id,name,pins,kind:'header',bodyPad:0.18};
}
const STD_LIBRARY = [
  {id:'res', name:'Resistor', pins:[{name:'1',dx:0,dy:0},{name:'2',dx:3,dy:0}], kind:'passive2', bodyPad:0.28, bodyShape:'cyl'},
  {id:'led', name:'LED', pins:[{name:'A',dx:0,dy:0},{name:'K',dx:2,dy:0}], kind:'led', bodyPad:0.4, bodyShape:'round'},
  {id:'cap', name:'Capacitor', pins:[{name:'+',dx:0,dy:0},{name:'-',dx:2,dy:0}], kind:'cap', bodyPad:0.35, bodyShape:'round'},
  {id:'diode', name:'Diode', pins:[{name:'A',dx:0,dy:0},{name:'K',dx:2,dy:0}], kind:'diode', bodyPad:0.3, bodyShape:'cyl'},
  {id:'btn4', name:'Push button', pins:[{name:'1',dx:0,dy:0},{name:'2',dx:2,dy:0},{name:'3',dx:0,dy:2},{name:'4',dx:2,dy:2}], kind:'button', bodyPad:0.5, bodyShape:'square'},
  {id:'pot', name:'Potentiometer', pins:[{name:'1',dx:0,dy:0},{name:'2',dx:1,dy:0},{name:'3',dx:2,dy:0}], kind:'pot', bodyPad:0.55, bodyShape:'round'},
  {id:'trans', name:'Transistor TO-92', pins:[{name:'E',dx:0,dy:0},{name:'B',dx:1,dy:0},{name:'C',dx:2,dy:0}], kind:'trans', bodyPad:0.4, bodyShape:'round'},
  {id:'reg', name:'Voltage regulator TO-220', pins:[{name:'IN',dx:0,dy:0},{name:'GND',dx:1,dy:0},{name:'OUT',dx:2,dy:0}], kind:'reg', bodyPad:0.4, bodyShape:'square'},
  dipFootprint('dip8','IC DIP-8',8),
  dipFootprint('dip14','IC DIP-14',14),
  dipFootprint('dip16','IC DIP-16',16),
  dipFootprint('dip18','IC DIP-18',18),
  dipFootprint('dip20','IC DIP-20',20),
  dipFootprint('dip28','IC DIP-28',28),
  headerFootprint('hdr1x8','Header 1×8',8,1),
  headerFootprint('hdr2x8','Header 2×8',8,2),
  headerFootprint('hdr1x4','Header 1×4',4,1),
  {id:'esp32c3', name:'ESP32-C3 DevKit', kind:'mcu', bodyPad:0.3, bodyShape:'square', pins:(function(){
      const left=['GND','3V3','RST','GPIO0','GPIO1','GPIO2','GPIO3','GPIO4','GPIO5'];
      const right=['GPIO10','GPIO9','GPIO8','GPIO7','GPIO6','TX','RX','5V','GND'];
      const pins=[]; left.forEach((n,i)=>pins.push({name:n,dx:0,dy:i})); right.forEach((n,i)=>pins.push({name:n,dx:1,dy:i}));
      return pins;
    })()},
  {id:'nano', name:'Arduino Nano', kind:'mcu', bodyPad:0.3, bodyShape:'square', pins:(function(){
      const left=['D13','3V3','REF','A0','A1','A2','A3','A4','A5','A6','A7','5V','RST','GND','VIN'];
      const right=['D12','D11','D10','D9','D8','D7','D6','D5','D4','D3','D2','GND','RST','RX0','TX1'];
      const pins=[]; left.forEach((n,i)=>pins.push({name:n,dx:0,dy:i})); right.forEach((n,i)=>pins.push({name:n,dx:1,dy:i}));
      return pins;
    })()},
];
STD_LIBRARY.forEach(fp=>{
  if(fp.rowGapUnits===undefined) fp.rowGapUnits = 1;
  fp.pins.forEach((p,i)=>{ if(p.number===undefined) p.number = i+1; });
});

/* ---------------------------------------------------------------------
   2. APPLICATION STATE
--------------------------------------------------------------------- */
const state = {
  board:{ cols:30, rows:20, spacingMm:2.54, gapRow:0, gapCol:0, gapRowWidth:1, gapColWidth:1, linkFront:'none', linkBack:'none', railTop:false, railBottom:false },
  components:[],   // {id, fpId, col,row, rot, mirror, face, label}
  customFootprints:{}, // id -> footprint def
  wires:[],        // {id, face, color, points:[{ref:'hole',col,row}|{ref:'pin',compId,pinIndex}]}
  view:{ zoom:1, ox:0, oy:0, face:'front' },
  viewOpts:{ showPinNumbers:true, showPinNames:true, showCompLabels:true, showWires:true, showOtherSideComponents:true, showOtherSideWires:true, opaqueBodies:false },
  ui:{ tool:'select', selectedComponent:null, selectedFootprintToPlace:null, drawingWire:null, probeResult:null, showNetColors:false }
};

function getFootprint(fpId){
  return state.customFootprints[fpId] || STD_LIBRARY.find(f=>f.id===fpId);
}

/* ---------------------------------------------------------------------
   3. GEOMETRY — grid <-> pixels, visual gap, footprint rotation
--------------------------------------------------------------------- */
const GRID_PX = 26; // grid step in pixels at zoom=1

/* The center gap removes a band of hole positions entirely (no holes, no
   placement) instead of stretching the pixel grid — this keeps every grid
   step a fixed GRID_PX, so components straddling the gap never get
   visually enlarged: their own defined pin spacing is always preserved,
   and their pins always land exactly on real holes. */
/* b.rows / b.cols are the USABLE hole counts the person configures. When a
   center gap is active it does not eat into that count — it adds
   Math.max(1,width) extra physical row/col slots on top, so the number of
   placeable rows/columns always matches what was entered. totalRows()/
   totalCols() give the full physical span (usable + gap slots), which is
   what every geometry/iteration helper below should use. */
function totalRows(){
  const b = state.board;
  return b.rows + (b.gapRow>0 ? Math.max(1,b.gapRowWidth||1) : 0);
}
function totalCols(){
  const b = state.board;
  return b.cols + (b.gapCol>0 ? Math.max(1,b.gapColWidth||1) : 0);
}
function isRowGapped(row){
  const b = state.board;
  return b.gapRow>0 && row>=0 && row<totalRows() && row>=b.gapRow && row<b.gapRow+Math.max(1,b.gapRowWidth||1);
}
function isColGapped(col){
  const b = state.board;
  return b.gapCol>0 && col>=0 && col<totalCols() && col>=b.gapCol && col<b.gapCol+Math.max(1,b.gapColWidth||1);
}
const RAIL_GAP_PX = 20; // visual space between a rail block and the main grid

function mainGridHeightPx(){
  return (totalRows()-1)*GRID_PX;
}
function railBlockHeightPx(){ return GRID_PX + RAIL_GAP_PX; }

function holeX(col){
  return col*GRID_PX;
}
function holeY(row){
  const b = state.board;
  const topOffset = b.railTop ? railBlockHeightPx() : 0;
  const rows = totalRows();
  if(row===-2) return 0;                    // top rail, +V line (red)
  if(row===-1) return GRID_PX;               // top rail, GND line (black)
  if(row>=0 && row<rows){
    return topOffset + row*GRID_PX;
  }
  const mainH = mainGridHeightPx();
  if(row===rows) return topOffset + mainH + RAIL_GAP_PX;         // bottom rail, +V line (red)
  if(row===rows+1) return topOffset + mainH + RAIL_GAP_PX + GRID_PX; // bottom rail, GND line (black)
  return topOffset + row*GRID_PX;
}
/* ordered list of every existing row index (grid + active rails) */
function allRowIndices(){
  const b = state.board;
  const rows = totalRows();
  const arr=[];
  if(b.railTop) arr.push(-2,-1);
  for(let r=0;r<rows;r++) arr.push(r);
  if(b.railBottom) arr.push(rows,rows+1);
  return arr;
}
function railKind(row){ // 'plus' | 'gnd' | null
  const rows = totalRows();
  if(row===-2||row===rows) return 'plus';
  if(row===-1||row===rows+1) return 'gnd';
  return null;
}

function holeToPixel(col,row){
  return {x: holeX(col), y: holeY(row)};
}

function rotatePin(dx,dy,rot,mirror){
  if(mirror) dx = -dx;
  let x=dx,y=dy;
  for(let i=0;i<((rot/90)%4+4)%4;i++){ const nx=-y, ny=x; x=nx; y=ny; }
  return {dx:x,dy:y};
}

function componentPinHoles(comp){
  const fp = getFootprint(comp.fpId);
  if(!fp) return [];
  const ov = comp.pinOverrides || {};
  return fp.pins.map((p,idx)=>{
    const r = rotatePin(p.dx,p.dy,comp.rot||0,comp.mirror||false);
    const o = ov[idx] || {};
    const name = (o.name!==undefined && o.name!=='') ? o.name : p.name;
    const number = (o.number!==undefined && o.number!=='') ? o.number : (p.number!==undefined?p.number:idx+1);
    return {col:comp.col+r.dx, row:comp.row+r.dy, name, number, index:idx};
  });
}

/* Body rectangle of a footprint, in cells relative to pin (0,0).
   Custom footprints may store an explicit `body` {x0,y0,x1,y1}; otherwise it is derived from the pins. */
function footprintBody(fp){
  if(fp.body && isFinite(fp.body.x0) && isFinite(fp.body.x1) && isFinite(fp.body.y0) && isFinite(fp.body.y1)) return fp.body;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  fp.pins.forEach(p=>{ x0=Math.min(x0,p.dx); x1=Math.max(x1,p.dx); y0=Math.min(y0,p.dy); y1=Math.max(y1,p.dy); });
  if(!isFinite(x0)){ x0=y0=x1=y1=0; }
  const pad = (fp.bodyPad||0.3)+0.28;
  return {x0:x0-pad, y0:y0-pad, x1:x1+pad, y1:y1+pad};
}
/* body rectangle in world pixels for a placed component (rotation/mirror applied) */
function componentBodyRect(comp){
  const fp = getFootprint(comp.fpId);
  if(!fp) return null;
  const b = footprintBody(fp);
  const a = rotatePin(b.x0,b.y0,comp.rot||0,comp.mirror||false);
  const c = rotatePin(b.x1,b.y1,comp.rot||0,comp.mirror||false);
  const anchor = holeToPixel(comp.col,comp.row);
  const dx0=Math.min(a.dx,c.dx), dx1=Math.max(a.dx,c.dx), dy0=Math.min(a.dy,c.dy), dy1=Math.max(a.dy,c.dy);
  return {bx:anchor.x+dx0*GRID_PX, by:anchor.y+dy0*GRID_PX, bw:(dx1-dx0)*GRID_PX, bh:(dy1-dy0)*GRID_PX};
}

function componentBounds(comp){
  const holes = componentPinHoles(comp);
  let minC=Infinity,maxC=-Infinity,minR=Infinity,maxR=-Infinity;
  holes.forEach(h=>{ minC=Math.min(minC,h.col); maxC=Math.max(maxC,h.col); minR=Math.min(minR,h.row); maxR=Math.max(maxR,h.row); });
  return {minC,maxC,minR,maxR};
}

/* resolve a wire point reference to current hole coords */
function resolveWirePoint(pt){
  if(pt.ref==='pin'){
    const comp = state.components.find(c=>c.id===pt.compId);
    if(!comp) return null;
    const holes = componentPinHoles(comp);
    const h = holes[pt.pinIndex];
    if(!h) return null;
    return {col:h.col,row:h.row};
  }
  if(pt.ref==='free') return null; // free waypoint: purely visual, never electrical
  return {col:pt.col,row:pt.row};
}
/* pixel position of any wire point (including free waypoints) */
function wirePointPixel(pt){
  if(pt.ref==='free') return {x:pt.x,y:pt.y};
  const h = resolveWirePoint(pt);
  return h ? holeToPixel(h.col,h.row) : null;
}
function wirePixels(w){ return w.points.map(wirePointPixel).filter(Boolean); }
/* only the first and last points of a wire are electrical */
function wireEnds(w){
  const a = w.points.length ? resolveWirePoint(w.points[0]) : null;
  const b = w.points.length>1 ? resolveWirePoint(w.points[w.points.length-1]) : null;
  return [a,b].filter(Boolean);
}

/* ---------------------------------------------------------------------
   4. ELECTRICAL MODEL — net computation
--------------------------------------------------------------------- */
/* Parts (components and wires) are soldered on the face OPPOSITE to the one
   they are placed on, so a part placed on the front is electrically attached
   to the BACK copper (and vice versa). Each face therefore has its own,
   independent net graph, built from that face's copper links only. */
function oppositeFace(f){ return f==='back' ? 'front' : 'back'; }
function solderFace(item){ return oppositeFace(item.face||'front'); }

function computeNets(copperFace){
  copperFace = copperFace || state.view.face;
  const uf = new UnionFind();
  uf.face = copperFace;
  const b = state.board;
  function ensure(c,r){ uf.find(keyOf(c,r)); }
  // per-side links
  const rows = totalRows(), cols = totalCols();
  function applyLink(mode){
    if(mode==='columns'){
      for(let c=0;c<cols;c++){
        if(isColGapped(c)) continue; // no holes in the gap band
        let prevKey=null;
        for(let r=0;r<rows;r++){
          if(isRowGapped(r)){ prevKey=null; continue; } // gap band: no holes, chain breaks
          ensure(c,r);
          const k = keyOf(c,r);
          if(prevKey) uf.union(prevKey,k);
          prevKey = k;
        }
      }
    } else if(mode==='rows'){
      for(let r=0;r<rows;r++){
        if(isRowGapped(r)) continue;
        let prevKey=null;
        for(let c=0;c<cols;c++){
          if(isColGapped(c)){ prevKey=null; continue; }
          ensure(c,r);
          const k = keyOf(c,r);
          if(prevKey) uf.union(prevKey,k);
          prevKey = k;
        }
      }
    } else {
      for(let c=0;c<cols;c++) for(let r=0;r<rows;r++){ if(!isRowGapped(r) && !isColGapped(c)) ensure(c,r); }
    }
  }
  applyLink(copperFace==='front' ? b.linkFront : b.linkBack);

  // power rails: each rail line is one continuous net along its whole length
  function unionRail(row){
    let prevKey=null;
    for(let c=0;c<cols;c++){
      ensure(c,row);
      const k = keyOf(c,row);
      if(prevKey) uf.union(prevKey,k);
      prevKey = k;
    }
  }
  if(b.railTop){ unionRail(-2); unionRail(-1); }
  if(b.railBottom){ unionRail(rows); unionRail(rows+1); }

  // wires: bond all their points together, but only on the copper face they are soldered to
  state.wires.forEach(w=>{
    if(solderFace(w)!==copperFace) return;
    let prev=null;
    wireEnds(w).forEach(h=>{
      ensure(h.col,h.row);
      const k = keyOf(h.col,h.row);
      if(prev) uf.union(prev,k);
      prev = k;
    });
  });

  return uf;
}

function netMembersOf(uf,col,row){
  const root = uf.find(keyOf(col,row));
  const members = {face:uf.face, holes:[], pins:[], wires:[]};
  for(let c=0;c<totalCols();c++) allRowIndices().forEach(r=>{
    const k = keyOf(c,r);
    if(uf.parent.has(k) && uf.find(k)===root) members.holes.push({col:c,row:r});
  });
  // only parts soldered on this copper face belong to its nets
  state.components.forEach(comp=>{
    if(solderFace(comp)!==uf.face) return;
    componentPinHoles(comp).forEach(h=>{
      const k = keyOf(h.col,h.row);
      if(uf.parent.has(k) && uf.find(k)===root) members.pins.push({compId:comp.id,compLabel:comp.label,compFace:comp.face||'front',pinName:h.name,pinNumber:h.number,col:h.col,row:h.row});
    });
  });
  state.wires.forEach(w=>{
    if(solderFace(w)!==uf.face) return;
    const touches = wireEnds(w).some(h=>{
      return h && uf.parent.has(keyOf(h.col,h.row)) && uf.find(keyOf(h.col,h.row))===root;
    });
    if(touches) members.wires.push({id:w.id,color:w.color});
  });
  return members;
}

/* every net (per copper face) that links at least two component pins */
function computeConnections(){
  const out = [];
  ['front','back'].forEach(face=>{
    const uf = computeNets(face);
    const groups = new Map();
    state.components.forEach(comp=>{
      if(solderFace(comp)!==face) return;
      componentPinHoles(comp).forEach(h=>{
        const k = keyOf(h.col,h.row);
        if(!uf.parent.has(k)) return;
        const root = uf.find(k);
        if(!groups.has(root)) groups.set(root,[]);
        groups.get(root).push({comp, h});
      });
    });
    groups.forEach(pins=>{ if(pins.length>=2) out.push({face, pins}); });
  });
  return out;
}

/* conflict detection: two components sharing the same hole */
function detectWarnings(){
  const warns = [];
  const occ = new Map(); // key -> [ {compId,pinName} ]
  state.components.forEach(comp=>{
    componentPinHoles(comp).forEach(h=>{
      if(isRowGapped(h.row) || isColGapped(h.col)){
        warns.push(`${comp.label}.${h.name} (#${h.number}) falls in the center gap: there is no hole there.`);
      }
      const k = keyOf(h.col,h.row);
      if(!occ.has(k)) occ.set(k,[]);
      occ.get(k).push({compId:comp.id,label:comp.label,pinName:h.name});
    });
  });
  occ.forEach((list,k)=>{
    if(list.length>1){
      const [c,r]=k.split(',');
      warns.push(`Overlap at (col ${c}, row ${r}): ${list.map(x=>x.label+'.'+x.pinName).join(' + ')} share the same hole.`);
    }
  });
  // wire segments that overlap exactly (same side, same consecutive point pair)
  const segMap = new Map();
  state.wires.forEach(w=>{
    const pts = wirePixels(w).map(p=>({col:Math.round(p.x),row:Math.round(p.y)}));
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b2=pts[i+1];
      const k1 = a.col+','+a.row+'|'+b2.col+','+b2.row+'|'+w.face;
      const k2 = b2.col+','+b2.row+'|'+a.col+','+a.row+'|'+w.face;
      const key = [k1,k2].sort()[0];
      if(!segMap.has(key)) segMap.set(key,[]);
      segMap.get(key).push(w.id);
    }
  });
  segMap.forEach((ids)=>{
    if(ids.length>1) warns.push(`${ids.length} wires overlap exactly on the same segment and side.`);
  });
  // a wire only touches a pin if both are soldered on the same copper face
  state.wires.forEach(w=>{
    w.points.forEach(pt=>{
      if(pt.ref!=='pin') return;
      const comp = state.components.find(c=>c.id===pt.compId);
      if(!comp || (comp.face||'front')===w.face) return;
      const pinName = (componentPinHoles(comp)[pt.pinIndex]||{}).name || '?';
      warns.push(`A wire placed on the ${w.face} (soldered on the ${solderFace(w)}) ends on ${comp.label}.${pinName}, but ${comp.label} is placed on the ${comp.face||'front'} (soldered on the ${solderFace(comp)}): they are not connected.`);
    });
  });
  return warns;
}

/* ---------------------------------------------------------------------
   5. CANVAS RENDERING
--------------------------------------------------------------------- */
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
let dpr = Math.max(1, window.devicePixelRatio||1);

function resizeCanvas(){
  const wrap = document.getElementById('stage-wrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  dpr = Math.max(1, window.devicePixelRatio||1);
  canvas.width = Math.round(w*dpr);
  canvas.height = Math.round(h*dpr);
  canvas.style.width = w+'px';
  canvas.style.height = h+'px';
  draw();
}

function worldToScreen(x,y){
  return { x: x*state.view.zoom + state.view.ox, y: y*state.view.zoom + state.view.oy };
}
function screenToWorld(x,y){
  return { x: (x-state.view.ox)/state.view.zoom, y: (y-state.view.oy)/state.view.zoom };
}

function boardPixelSize(){
  const b = state.board;
  const w = (totalCols()-1)*GRID_PX;
  let h = mainGridHeightPx();
  if(b.railTop) h += railBlockHeightPx();
  if(b.railBottom) h += railBlockHeightPx();
  return {w,h};
}

function nearestHole(worldX,worldY){
  const cols = totalCols();
  let bestC=0, bestCD=Infinity;
  for(let c=0;c<cols;c++){
    if(isColGapped(c)) continue; // no hole exists in the gap band
    const d = Math.abs(holeX(c)-worldX);
    if(d<bestCD){ bestCD=d; bestC=c; }
  }
  let bestR=0, bestRD=Infinity;
  allRowIndices().forEach(r=>{
    if(isRowGapped(r)) return; // no hole exists in the gap band
    const d = Math.abs(holeY(r)-worldY);
    if(d<bestRD){ bestRD=d; bestR=r; }
  });
  const p = holeToPixel(bestC,bestR);
  return {col:bestC,row:bestR,dist:Math.hypot(p.x-worldX,p.y-worldY)};
}

function pinAtHole(col,row){
  for(const comp of state.components){
    const holes = componentPinHoles(comp);
    for(const h of holes){
      if(h.col===col && h.row===row) return {compId:comp.id, pinIndex:h.index, pinName:h.name, pinNumber:h.number, comp};
    }
  }
  return null;
}

/* readable label for a hole: "Component.name (#X)" or "hole (col,row)" / rail */
function describeHole(col,row){
  const pin = pinAtHole(col,row);
  if(pin) return `${pin.comp.label}.${pin.pinName} (#${pin.pinNumber})`;
  const rk = railKind(row);
  if(rk==='plus') return `+V rail (col ${col})`;
  if(rk==='gnd') return `GND rail (col ${col})`;
  return `hole (${col},${row})`;
}
function describeWirePoint(pt){
  const h = resolveWirePoint(pt);
  if(!h) return '?';
  return describeHole(h.col,h.row);
}

let netColorCache = null, netColorUf = null;
function getNetColor(uf, col, row){
  if(!state.ui.showNetColors) return null;
  if(netColorUf!==uf){ netColorCache = new Map(); netColorUf = uf; }
  const root = uf.find(keyOf(col,row));
  if(!netColorCache.has(root)){
    const palette = ['#3763e8','#e0524a','#1f9e6d','#e08a2c','#8c4fd6','#0fa3b1','#d6458c','#5c7a1f','#c9982c','#2c7be0'];
    netColorCache.set(root, palette[netColorCache.size % palette.length]);
  }
  return netColorCache.get(root);
}

function draw(){
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w/dpr,h/dpr);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f6f8';
  ctx.fillRect(0,0,w/dpr,h/dpr);

  ctx.translate(state.view.ox, state.view.oy);
  ctx.scale(state.view.zoom, state.view.zoom);

  const b = state.board;
  const uf = computeNets();

  // board plate background
  const size = boardPixelSize();
  const pad = GRID_PX*0.75;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e3e6eb';
  ctx.lineWidth = 1/state.view.zoom;
  roundRect(ctx, -pad, -pad, size.w+pad*2, size.h+pad*2, 10);
  ctx.fill(); ctx.stroke();

  const totalR = totalRows(), totalC = totalCols();

  // center gap shading (spans the removed row/col band, edge to edge of the real holes flanking it)
  if(b.gapRow>0){
    const gapEnd = Math.min(totalR, b.gapRow+Math.max(1,b.gapRowWidth||1));
    const yTop = holeToPixel(0,b.gapRow-1).y;
    const yBot = holeToPixel(0,gapEnd<totalR?gapEnd:totalR-1).y + (gapEnd<totalR?0:GRID_PX);
    ctx.fillStyle = 'rgba(180,190,205,0.16)';
    ctx.fillRect(-pad, yTop+GRID_PX/2, size.w+pad*2, (yBot-yTop-GRID_PX));
  }
  if(b.gapCol>0){
    const gapEnd = Math.min(totalC, b.gapCol+Math.max(1,b.gapColWidth||1));
    const xLeft = holeToPixel(b.gapCol-1,0).x;
    const xRight = holeToPixel(gapEnd<totalC?gapEnd:totalC-1,0).x + (gapEnd<totalC?0:GRID_PX);
    ctx.fillStyle = 'rgba(180,190,205,0.16)';
    ctx.fillRect(xLeft+GRID_PX/2, -pad, (xRight-xLeft-GRID_PX), size.h+pad*2);
  }

  // face link visualization (bands) for the currently viewed face
  const linkMode = state.view.face==='front' ? b.linkFront : b.linkBack;
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = state.view.face==='front' ? '#3763e8' : '#e08a2c';
  if(linkMode==='columns'){
    for(let c=0;c<totalC;c++){
      drawColumnBand(c);
    }
  } else if(linkMode==='rows'){
    for(let r=0;r<totalR;r++){
      drawRowBand(r);
    }
  }
  ctx.restore();

  // grid holes (+ power rails) — none drawn inside the removed gap band
  for(let c=0;c<totalC;c++){
    if(isColGapped(c)) continue;
    allRowIndices().forEach(r=>{
      if(isRowGapped(r)) return;
      const p = holeToPixel(c,r);
      const netColor = getNetColor(uf,c,r);
      const rk = railKind(r);
      ctx.beginPath();
      ctx.arc(p.x,p.y,3.1,0,Math.PI*2);
      ctx.fillStyle = netColor || (rk==='plus' ? '#e0524a' : rk==='gnd' ? '#3a3f47' : '#c7ccd4');
      ctx.fill();
    });
  }
  // rail lines and end labels
  ctx.save();
  ctx.font = '700 10px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.textBaseline='middle';
  function drawRailLine(row,color,label){
    const y = holeY(row);
    ctx.strokeStyle = color; ctx.globalAlpha=0.5; ctx.lineWidth=1.4/state.view.zoom;
    ctx.beginPath(); ctx.moveTo(holeX(0)-GRID_PX*0.5,y); ctx.lineTo(holeX(totalC-1)+GRID_PX*0.5,y); ctx.stroke();
    ctx.globalAlpha=1;
    if(state.view.zoom>0.4){
      ctx.fillStyle = color; ctx.textAlign='right';
      ctx.fillText(label, holeX(0)-GRID_PX*0.7, y);
    }
  }
  if(b.railTop){ drawRailLine(-2,'#e0524a','+'); drawRailLine(-1,'#3a3f47','−'); }
  if(b.railBottom){ drawRailLine(totalR,'#e0524a','+'); drawRailLine(totalR+1,'#3a3f47','−'); }
  ctx.restore();

  // probe highlight
  if(state.ui.probeResult){
    // fixed styling per copper face (independent of the viewed side):
    // front copper = amber filled halo, back copper = violet dashed ring
    const res = state.ui.probeResult;
    ctx.save();
    if(res.back){
      ctx.strokeStyle = '#8c4fd6';
      ctx.lineWidth = 1.8/state.view.zoom;
      ctx.setLineDash([3/state.view.zoom,3/state.view.zoom]);
      res.back.holes.forEach(h=>{
        const p = holeToPixel(h.col,h.row);
        ctx.beginPath(); ctx.arc(p.x,p.y,8.5,0,Math.PI*2); ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    if(res.front){
      ctx.fillStyle = 'rgba(255,176,32,0.32)';
      res.front.holes.forEach(h=>{
        const p = holeToPixel(h.col,h.row);
        ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2); ctx.fill();
      });
    }
    ctx.restore();
  }

  // wires
  if(state.viewOpts.showWires){
    state.wires.forEach(w=>{ if(wireVisible(w)) drawWire(w, uf); });
  }

  // wire being drawn
  if(state.ui.drawingWire){
    drawWire(state.ui.drawingWire, uf, true);
  }

  // components
  state.components.forEach(comp=>drawComponent(comp, comp.id===state.ui.selectedComponent));

  ctx.restore();
  updateCompActionsPosition();
}

function drawColumnBand(c){
  if(isColGapped(c)) return;
  const b = state.board;
  const totalR = totalRows();
  const top = holeToPixel(c,0), bot = holeToPixel(c, (b.gapRow>0? b.gapRow-1 : totalR-1));
  ctx.fillRect(top.x-GRID_PX*0.32, top.y-GRID_PX*0.32, GRID_PX*0.64, (bot.y-top.y)+GRID_PX*0.64);
  const gapEnd = b.gapRow>0 ? b.gapRow+Math.max(1,b.gapRowWidth||1) : 0;
  if(b.gapRow>0 && gapEnd<totalR){
    const top2 = holeToPixel(c,gapEnd), bot2 = holeToPixel(c,totalR-1);
    ctx.fillRect(top2.x-GRID_PX*0.32, top2.y-GRID_PX*0.32, GRID_PX*0.64, (bot2.y-top2.y)+GRID_PX*0.64);
  }
}
function drawRowBand(r){
  if(isRowGapped(r)) return;
  const b = state.board;
  const totalC = totalCols();
  const left = holeToPixel(0,r), right = holeToPixel((b.gapCol>0? b.gapCol-1: totalC-1), r);
  ctx.fillRect(left.x-GRID_PX*0.32, left.y-GRID_PX*0.32, (right.x-left.x)+GRID_PX*0.64, GRID_PX*0.64);
  const gapEnd = b.gapCol>0 ? b.gapCol+Math.max(1,b.gapColWidth||1) : 0;
  if(b.gapCol>0 && gapEnd<totalC){
    const left2 = holeToPixel(gapEnd,r), right2 = holeToPixel(totalC-1,r);
    ctx.fillRect(left2.x-GRID_PX*0.32, left2.y-GRID_PX*0.32, (right2.x-left2.x)+GRID_PX*0.64, GRID_PX*0.64);
  }
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function drawWire(w, uf, isDrawing){
  const px = wirePixels(w);
  if(px.length<1) return;
  const otherSide = !isDrawing && w.face!==state.view.face;
  ctx.save();
  const dashed = otherSide;
  if(dashed) ctx.setLineDash([6/state.view.zoom,4/state.view.zoom]);
  const strokeCol = otherSide ? '#aeb4bd' : w.color;
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = (isDrawing?3:2.4)/state.view.zoom;
  ctx.lineCap = 'round'; ctx.lineJoin='round';
  ctx.globalAlpha = isDrawing? 0.85: (otherSide? 0.55 : 1);
  ctx.beginPath();
  px.forEach((p,i)=> i===0? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
  ctx.stroke();
  ctx.setLineDash([]);
  // endpoints
  ctx.fillStyle = strokeCol;
  px.forEach((p,i)=>{
    const isEnd = i===0||i===px.length-1;
    if(!isEnd && !w.selected) return; // bends are only shown when selected
    ctx.beginPath();
    if(isEnd) ctx.arc(p.x,p.y,4.2,0,Math.PI*2);
    else ctx.rect(p.x-2.8,p.y-2.8,5.6,5.6); // square handle = visual bend, not a connection
    ctx.fill();
  });
  if(w.selected){
    ctx.strokeStyle = '#1c2430'; ctx.lineWidth=1/state.view.zoom;
    px.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,6,0,Math.PI*2); ctx.stroke(); });
  }
  ctx.restore();
}

function componentColor(kind){
  const map = {res:'#c9a35a', led:'#e0524a', cap:'#4a90d9', diode:'#666', button:'#888', pot:'#7a7a7a', trans:'#555', reg:'#555', dip:'#2b2f36', header:'#2b2f36', mcu:'#243040', passive2:'#c9a35a'};
  return map[kind] || '#3d4550';
}


function drawComponent(comp, selected){
  const fp = getFootprint(comp.fpId);
  if(!fp) return;
  const compFace = comp.face || 'front';
  const otherSide = compFace !== state.view.face;
  if(otherSide && !state.viewOpts.showOtherSideComponents) return;

  const holes = componentPinHoles(comp);
  const pxHoles = holes.map(h=>({...h, p:holeToPixel(h.col,h.row)}));
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  pxHoles.forEach(h=>{ minX=Math.min(minX,h.p.x); maxX=Math.max(maxX,h.p.x); minY=Math.min(minY,h.p.y); maxY=Math.max(maxY,h.p.y); });
  const br = componentBodyRect(comp);
  const bx=br.bx, by=br.by, bw=br.bw, bh=br.bh;

  ctx.save();
  if(otherSide) ctx.globalAlpha = 0.45;
  const col = otherSide ? '#9aa1ac' : componentColor(fp.kind);
  ctx.fillStyle = selected ? '#eef2ff' : (otherSide ? '#f1f2f4' : '#fff');
  ctx.strokeStyle = selected ? '#3763e8' : col;
  ctx.lineWidth = (selected?2.4:1.4)/state.view.zoom;
  roundRect(ctx, bx,by,bw,bh, Math.min(10,bw/4,bh/4));
  // body fill is 75% transparent by default (so holes and wires stay visible); outline stays solid
  const baseAlpha = ctx.globalAlpha;
  if(!state.viewOpts.opaqueBodies) ctx.globalAlpha = baseAlpha*0.25;
  ctx.fill();
  ctx.globalAlpha = baseAlpha;
  ctx.stroke();

  // pin1 marker (small notch on dip/header)
  if(fp.kind==='dip' || fp.kind==='mcu'){
    ctx.beginPath();
    ctx.arc(bx+8/state.view.zoom, by+8/state.view.zoom, 2.6/state.view.zoom,0,Math.PI*2);
    ctx.fillStyle = col; ctx.fill();
  }

  // pins
  pxHoles.forEach(h=>{
    ctx.beginPath();
    ctx.arc(h.p.x,h.p.y,3.4,0,Math.PI*2);
    ctx.fillStyle = col;
    ctx.fill();
  });

  // labels: component label centered, pin names/numbers near each pin (only if zoom decent)
  const fontSize = 10;
  if(state.viewOpts.showCompLabels && state.view.zoom>0.55){
    ctx.fillStyle = otherSide ? '#9aa1ac' : '#1c2430';
    ctx.font = '600 '+fontSize+'px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(comp.label || fp.name, bx+bw/2, by-8/state.view.zoom);
  }
  if((state.viewOpts.showPinNames || state.viewOpts.showPinNumbers) && state.view.zoom>0.75){
    ctx.font = '500 '+(fontSize-2)+'px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle = otherSide ? '#aeb4bd' : '#5b6472';
    const showNum = state.viewOpts.showPinNumbers, showName = state.viewOpts.showPinNames;
    const lineH = 9.5;
    const numCol = otherSide ? '#9db4e6' : '#2456d6';   // pin number: blue
    const nameCol = otherSide ? '#b9a98f' : '#b3541e';  // pin name: orange, shown BELOW the number
    pxHoles.forEach(h=>{
      const above = h.p.y <= by+bh/2;
      const lines=[];
      if(showNum) lines.push({t:'#'+h.number, c:numCol});
      if(showName) lines.push({t:String(h.name), c:nameCol});
      ctx.textAlign='center'; ctx.textBaseline='middle';
      // block of lines: number on top, name underneath; placed outside the body
      const total = lines.length*lineH;
      const startY = above ? h.p.y-7-total : h.p.y+7;
      lines.forEach((ln,i)=>{
        ctx.fillStyle = ln.c;
        ctx.fillText(ln.t, h.p.x, startY+i*lineH+lineH/2);
      });
    });
  }
  ctx.restore();
}

/* readable footprint preview, reused for the library grid, the custom
   footprint creation modal, and the placed-component edit modal */
let lastPreviewGeom = null;
function footprintPreviewSvg(fp, opts){
  opts = opts || {};
  const rot = opts.rot||0, mirror = !!opts.mirror, labels = opts.labels!==false, unit = opts.unit||30;
  const pins = fp.pins.map(p=>{
    const r = rotatePin(p.dx,p.dy,rot,mirror);
    return {name:p.name, number:p.number, dx:r.dx, dy:r.dy};
  });
  // body rectangle (custom or derived), rotated/mirrored like the pins
  const bodyCells = opts.body || footprintBody(fp);
  const ba = rotatePin(bodyCells.x0,bodyCells.y0,rot,mirror), bc = rotatePin(bodyCells.x1,bodyCells.y1,rot,mirror);
  const body = {x0:Math.min(ba.dx,bc.dx), x1:Math.max(ba.dx,bc.dx), y0:Math.min(ba.dy,bc.dy), y1:Math.max(ba.dy,bc.dy)};
  let minX=0,minY=0,maxX=0,maxY=0;
  pins.forEach(p=>{ minX=Math.min(minX,p.dx); maxX=Math.max(maxX,p.dx); minY=Math.min(minY,p.dy); maxY=Math.max(maxY,p.dy); });
  minX=Math.min(minX,body.x0); maxX=Math.max(maxX,body.x1); minY=Math.min(minY,body.y0); maxY=Math.max(maxY,body.y1);
  if(opts.bounds){ minX=opts.bounds.minX; maxX=opts.bounds.maxX; minY=opts.bounds.minY; maxY=opts.bounds.maxY; }
  const padd = labels? 34 : 10;
  const w = (maxX-minX)*unit+padd*2, h=(maxY-minY)*unit+padd*2+(labels?16:0);
  lastPreviewGeom = {minX,minY,maxX,maxY,unit,padd,w,h};
  let s = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"${opts.editor?' style="touch-action:none;user-select:none;"':''}>`;
  s += `<rect x="3" y="3" width="${w-6}" height="${h-6}" rx="7" fill="#fff" stroke="#c7ccd4" stroke-width="1.4"/>`;
  const rx=(body.x0-minX)*unit+padd, ry=(body.y0-minY)*unit+padd, rw=(body.x1-body.x0)*unit, rh=(body.y1-body.y0)*unit;
  s += `<rect ${opts.editor?'data-h="move" style="cursor:move;" ':''}x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="6" fill="#eef2fb" stroke="#7f8da8" stroke-width="1.3"/>`;
  pins.forEach(p=>{
    const x = (p.dx-minX)*unit+padd, y=(p.dy-minY)*unit+padd;
    s += `<circle cx="${x}" cy="${y}" r="${labels?4:2.4}" fill="#3d4550"/>`;
    if(labels){
      s += `<text x="${x}" y="${y+14}" font-size="9" text-anchor="middle" fill="#2456d6" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-weight="600">#${p.number!==undefined?p.number:''}</text>`;
      s += `<text x="${x}" y="${y+25}" font-size="9" text-anchor="middle" fill="#b3541e" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${escapeXml(p.name)}</text>`;
    }
  });
  if(opts.editor){
    // corner handles: dragging resizes the body, dragging the body moves it
    [['nw',rx,ry],['ne',rx+rw,ry],['sw',rx,ry+rh],['se',rx+rw,ry+rh]].forEach(([k,hx,hy])=>{
      s += `<circle data-h="${k}" cx="${hx}" cy="${hy}" r="13" fill="transparent" style="cursor:pointer;"/>`;
      s += `<circle data-h="${k}" cx="${hx}" cy="${hy}" r="5.5" fill="#3763e8" stroke="#fff" stroke-width="1.5" style="pointer-events:none;"/>`;
    });
  }
  s += '</svg>';
  return s;
}

/* ---------------------------------------------------------------------
   6. INTERACTIONS (pointer, pan/zoom, placement, wires, drag)
--------------------------------------------------------------------- */
let pointerState = { mode:null, startX:0,startY:0, startOx:0,startOy:0, dragComp:null, dragOffset:null, pinch:null, dragMoved:false, dragStartScreen:null };
const activePointers = new Map();

function fitBoardToView(){
  const wrap = document.getElementById('stage-wrap');
  const size = boardPixelSize();
  const pad = GRID_PX*0.75;
  const totalW = size.w+pad*2+40, totalH = size.h+pad*2+40;
  const z = clamp(Math.min(wrap.clientWidth/totalW, wrap.clientHeight/totalH), 0.15, 2.2);
  state.view.zoom = z;
  state.view.ox = (wrap.clientWidth - (size.w)*z)/2 + pad*z;
  state.view.oy = (wrap.clientHeight - (size.h)*z)/2 + pad*z;
  draw();
}

function statusPill(msg, ms){
  if(!msg) return;
  const el = document.getElementById('status-pill');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(statusPill._t);
  statusPill._t = setTimeout(()=>el.classList.remove('show'), ms||1800);
}

canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('wheel', onWheel, {passive:false});

function getCanvasPos(e){
  const r = canvas.getBoundingClientRect();
  return {x: e.clientX-r.left, y: e.clientY-r.top};
}

function hitTestComponent(worldX,worldY){
  for(let i=state.components.length-1;i>=0;i--){
    const comp = state.components[i];
    const fp = getFootprint(comp.fpId);
    if(!fp) continue;
    const br = componentBodyRect(comp);
    if(worldX>=br.bx && worldX<=br.bx+br.bw && worldY>=br.by && worldY<=br.by+br.bh) return comp;
    const near = componentPinHoles(comp).some(h=>{ const p=holeToPixel(h.col,h.row); return Math.hypot(p.x-worldX,p.y-worldY)<10; });
    if(near) return comp;
  }
  return null;
}

function wireVisible(w){
  if(!state.viewOpts.showWires) return false;
  return w.face===state.view.face || state.viewOpts.showOtherSideWires;
}
function hitTestWire(worldX,worldY){
  const thresh = 8/state.view.zoom;
  for(let i=state.wires.length-1;i>=0;i--){
    const w = state.wires[i];
    if(!wireVisible(w)) continue;
    const pts = wirePixels(w);
    for(let j=0;j<pts.length-1;j++){
      if(distToSeg(worldX,worldY,pts[j],pts[j+1])<thresh) return {wire:w, segIndex:j};
    }
  }
  return null;
}
function distToSeg(px,py,a,b){
  const dx=b.x-a.x, dy=b.y-a.y;
  const len2 = dx*dx+dy*dy;
  let t = len2? ((px-a.x)*dx+(py-a.y)*dy)/len2 : 0;
  t = clamp(t,0,1);
  const cx=a.x+t*dx, cy=a.y+t*dy;
  return Math.hypot(px-cx,py-cy);
}

function pinOrHoleAtWorld(worldX,worldY){
  const h = nearestHole(worldX,worldY);
  if(!h) return null;
  const p = holeToPixel(h.col,h.row);
  if(Math.hypot(p.x-worldX,p.y-worldY) > GRID_PX*0.62) return null;
  const pin = pinAtHole(h.col,h.row);
  if(pin) return {ref:'pin', compId:pin.compId, pinIndex:pin.pinIndex, col:h.col, row:h.row, label:pin.comp.label+'.'+pin.pinName};
  return {ref:'hole', col:h.col, row:h.row, label:'hole ('+h.col+','+h.row+')'};
}

let lastTapTime=0, lastTapTarget=null;

function onPointerDown(e){
  canvas.setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
  if(activePointers.size===2){
    const pts = [...activePointers.values()];
    pointerState.pinch = { d0: Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y), zoom0: state.view.zoom,
      midStart: screenToWorld((pts[0].x+pts[1].x)/2 - canvas.getBoundingClientRect().left, (pts[0].y+pts[1].y)/2 - canvas.getBoundingClientRect().top) };
    pointerState.mode='pinch';
    return;
  }
  const pos = getCanvasPos(e);
  const world = screenToWorld(pos.x,pos.y);
  const tool = state.ui.tool;

  if(tool==='select'){
    if(state.ui.selectedFootprintToPlace){
      const nh = nearestHole(world.x,world.y);
      if(nh){
        placeComponent(state.ui.selectedFootprintToPlace, nh.col, nh.row);
        state.ui.selectedFootprintToPlace = null;
        statusPill('Component placed');
      }
      return;
    }
    const comp = hitTestComponent(world.x,world.y);
    if(comp){
      selectComponent(comp.id);
      pointerState.mode='dragComp';
      pointerState.dragComp = comp;
      pointerState.dragOffset = {x: world.x - holeToPixel(comp.col,comp.row).x, y: world.y - holeToPixel(comp.col,comp.row).y};
      pointerState.dragStartScreen = {x:pos.x, y:pos.y};
      pointerState.dragMoved = false;
      return;
    }
    const wireHit = hitTestWire(world.x,world.y);
    if(wireHit){
      selectWire(wireHit.wire.id);
      pointerState.mode='dragWirePoint';
      // grab an existing point if close enough, otherwise drag from the segment to create a visual bend
      const pts = wireHit.wire.points.map(wirePointPixel);
      let bestI=-1,bestD=Infinity;
      pts.forEach((p,i)=>{ if(!p) return; const d=Math.hypot(p.x-world.x,p.y-world.y); if(d<bestD){bestD=d;bestI=i;} });
      if(bestD>12/state.view.zoom) bestI=-1;
      pointerState.dragWire = wireHit.wire;
      pointerState.dragWireIndex = bestI;
      pointerState.dragSegIndex = wireHit.segIndex;
      pointerState.dragStartScreen = {x:pos.x, y:pos.y};
      pointerState.dragMoved = false;
      return;
    }
    selectComponent(null); selectWire(null);
    pointerState.mode='pan';
    pointerState.startX=pos.x; pointerState.startY=pos.y;
    pointerState.startOx=state.view.ox; pointerState.startOy=state.view.oy;
    return;
  }

  if(tool==='wire'){
    const target = pinOrHoleAtWorld(world.x,world.y);
    if(!target){ pointerState.mode='pan'; pointerState.startX=pos.x; pointerState.startY=pos.y; pointerState.startOx=state.view.ox; pointerState.startOy=state.view.oy; return; }
    const now = Date.now();
    const isDoubleTap = (now-lastTapTime<380) && lastTapTarget && lastTapTarget.col===target.col && lastTapTarget.row===target.row;
    lastTapTime = now; lastTapTarget = target;

    if(!state.ui.drawingWire){
      const color = document.getElementById('wRandomColor').checked ? randomWireColor() : document.getElementById('wManualColor').value;
      state.ui.drawingWire = { id: uid('wire'), face: state.view.face||'front', color, points:[toWirePoint(target)] };
    } else {
      state.ui.drawingWire.points.push(toWirePoint(target));
      if(isDoubleTap){
        finishDrawingWire();
      }
    }
    draw();
    return;
  }

  if(tool==='bend'){
    const wireHit = hitTestWire(world.x,world.y);
    if(wireHit){
      const h = nearestHole(world.x,world.y);
      wireHit.wire.points.splice(wireHit.segIndex+1,0, {ref:'free',x:world.x,y:world.y});
      saveLocal(); refreshWireList(); draw();
    }
    return;
  }

  if(tool==='probe'){
    const target = pinOrHoleAtWorld(world.x,world.y);
    if(target){
      // independent of the viewed face: the probe follows the copper face where the parts
      // touching this hole are soldered (opposite to their placement side)
      const res = {};
      probeFacesAt(target.col,target.row).forEach(f=>{ res[f] = netMembersOf(computeNets(f), target.col, target.row); });
      state.ui.probeResult = res;
      renderDebugResult(target, res);
      draw();
    }
    return;
  }

  if(tool==='erase'){
    const comp = hitTestComponent(world.x,world.y);
    if(comp){ removeComponent(comp.id); return; }
    const wireHit = hitTestWire(world.x,world.y);
    if(wireHit){ removeWire(wireHit.wire.id); return; }
    return;
  }
}

function probeFacesAt(col,row){
  const faces = new Set();
  state.components.forEach(c=>{
    if(componentPinHoles(c).some(h=>h.col===col&&h.row===row)) faces.add(solderFace(c));
  });
  state.wires.forEach(w=>{
    if(wireEnds(w).some(h=>h.col===col&&h.row===row)) faces.add(solderFace(w));
  });
  // bare hole / rail: nothing attached yet, so show both copper faces
  return faces.size ? ['front','back'].filter(f=>faces.has(f)) : ['front','back'];
}

function toWirePoint(target){
  if(target.ref==='pin') return {ref:'pin', compId:target.compId, pinIndex:target.pinIndex};
  return {ref:'hole', col:target.col, row:target.row};
}

/* interior points of a wire become free (non-electrical) waypoints in world pixels */
function toBendPoints(points){
  return points.map((pt,i)=>{
    if(i===0||i===points.length-1||pt.ref==='free') return pt;
    const p = wirePointPixel(pt);
    return p ? {ref:'free',x:p.x,y:p.y} : null;
  }).filter(Boolean);
}

function finishDrawingWire(){
  const w = state.ui.drawingWire;
  if(!w) return;
  if(w.points.length<2){ state.ui.drawingWire=null; draw(); return; }
  // drop a duplicated last point (double-tap), then turn every interior point into a
  // purely visual waypoint: only the two ends of a wire are electrical
  const last = w.points[w.points.length-1], prevP = w.points[w.points.length-2];
  if(w.points.length>2 && JSON.stringify(last)===JSON.stringify(prevP)) w.points.pop();
  if(w.points.length<2){ state.ui.drawingWire=null; draw(); return; }
  w.points = toBendPoints(w.points);
  state.wires.push(w);
  state.ui.drawingWire = null;
  refreshWireList();
  saveLocal();
  statusPill('Wire added');
  draw();
}
document.getElementById('wFinishBtn').addEventListener('click', finishDrawingWire);

function onPointerMove(e){
  if(!activePointers.has(e.pointerId)) { return; }
  activePointers.set(e.pointerId, {x:e.clientX,y:e.clientY});

  if(pointerState.mode==='pinch' && activePointers.size===2){
    const pts=[...activePointers.values()];
    const d = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    const rect = canvas.getBoundingClientRect();
    const midX=(pts[0].x+pts[1].x)/2-rect.left, midY=(pts[0].y+pts[1].y)/2-rect.top;
    const scale = d/pointerState.pinch.d0;
    const newZoom = clamp(pointerState.pinch.zoom0*scale, 0.15, 4);
    state.view.zoom = newZoom;
    state.view.ox = midX - pointerState.pinch.midStart.x*newZoom;
    state.view.oy = midY - pointerState.pinch.midStart.y*newZoom;
    draw();
    return;
  }

  const pos = getCanvasPos(e);
  const world = screenToWorld(pos.x,pos.y);

  if(pointerState.mode==='pan'){
    state.view.ox = pointerState.startOx + (pos.x-pointerState.startX);
    state.view.oy = pointerState.startOy + (pos.y-pointerState.startY);
    draw();
  } else if(pointerState.mode==='dragComp' && pointerState.dragComp){
    if(!pointerState.dragMoved){
      const dist = Math.hypot(pos.x-pointerState.dragStartScreen.x, pos.y-pointerState.dragStartScreen.y);
      if(dist>6) pointerState.dragMoved = true;
    }
    const targetX = world.x - pointerState.dragOffset.x;
    const targetY = world.y - pointerState.dragOffset.y;
    const nh = nearestHole(targetX,targetY);
    if(nh){ pointerState.dragComp.col = nh.col; pointerState.dragComp.row = nh.row; draw(); }
  } else if(pointerState.mode==='dragWirePoint' && pointerState.dragWire){
    if(!pointerState.dragMoved){
      const dist = Math.hypot(pos.x-pointerState.dragStartScreen.x, pos.y-pointerState.dragStartScreen.y);
      if(dist>6) pointerState.dragMoved = true;
    }
    if(pointerState.dragMoved){
      const w = pointerState.dragWire;
      if(pointerState.dragWireIndex<0){
        // first move from a segment: create a free bend there
        w.points.splice(pointerState.dragSegIndex+1,0,{ref:'free',x:world.x,y:world.y});
        pointerState.dragWireIndex = pointerState.dragSegIndex+1;
      }
      const idx = pointerState.dragWireIndex;
      if(w.points[idx].ref==='free'){
        w.points[idx] = {ref:'free',x:world.x,y:world.y};
        draw();
      } else {
        // wire ends stay attached to a pin/hole
        const t = pinOrHoleAtWorld(world.x,world.y);
        if(t){ w.points[idx] = toWirePoint(t); }
        else { const nh = nearestHole(world.x,world.y); if(nh) w.points[idx] = {ref:'hole',col:nh.col,row:nh.row}; }
        draw();
      }
    }
  }
}

function onPointerUp(e){
  activePointers.delete(e.pointerId);
  if(activePointers.size<2) pointerState.pinch=null;
  if(pointerState.mode==='dragComp'){
    if(!pointerState.dragMoved && pointerState.dragComp){
      openComponentModal(pointerState.dragComp.id);
    } else {
      saveLocal(); checkWarningsUI(); refreshWireList();
    }
  }
  if(pointerState.mode==='dragWirePoint'){
    if(!pointerState.dragMoved && pointerState.dragWire){
      openWireModal(pointerState.dragWire.id);
    } else {
      saveLocal(); checkWarningsUI(); refreshWireList();
    }
  }
  if(activePointers.size===0) pointerState.mode=null;
}

function onWheel(e){
  e.preventDefault();
  const pos = getCanvasPos(e);
  const world = screenToWorld(pos.x,pos.y);
  const factor = Math.exp(-e.deltaY*0.0016);
  const newZoom = clamp(state.view.zoom*factor, 0.15, 4);
  state.view.ox = pos.x - world.x*newZoom;
  state.view.oy = pos.y - world.y*newZoom;
  state.view.zoom = newZoom;
  draw();
}

/* double click also finishes a wire (desktop) */
canvas.addEventListener('dblclick', function(){
  if(state.ui.tool==='wire' && state.ui.drawingWire) finishDrawingWire();
});

/* ---------------------------------------------------------------------
   7. COMPONENT / WIRE ACTIONS
--------------------------------------------------------------------- */
let componentCounters = {};
function placeComponent(fpId, col,row){
  const fp = getFootprint(fpId);
  const prefix = (fp.kind==='mcu')? 'U' : (fp.kind==='dip'?'U':(fp.kind==='led'?'D':(fp.kind==='res'||fp.kind==='passive2')?'R':(fp.kind==='cap'?'C':(fp.kind==='diode'?'D':(fp.kind==='button'?'SW':(fp.kind==='pot'?'RV':(fp.kind==='trans'?'Q':(fp.kind==='reg'?'U':'X'))))))));
  componentCounters[prefix] = (componentCounters[prefix]||0)+1;
  const comp = { id: uid('comp'), fpId, col, row, rot:0, mirror:false, face: state.view.face||'front', label: prefix+componentCounters[prefix] };
  state.components.push(comp);
  saveLocal();
  checkWarningsUI();
  refreshWireList();
  draw();
}
function removeComponent(id){
  state.components = state.components.filter(c=>c.id!==id);
  state.wires = state.wires.filter(w=>!w.points.some(pt=>pt.ref==='pin' && pt.compId===id));
  if(state.ui.selectedComponent===id) selectComponent(null);
  saveLocal(); checkWarningsUI(); refreshWireList(); draw();
}
function removeWire(id){
  state.wires = state.wires.filter(w=>w.id!==id);
  saveLocal(); refreshWireList(); checkWarningsUI(); draw();
}
function selectComponent(id){
  state.ui.selectedComponent = id;
  updateCompActionsPosition();
  draw();
}
function selectWire(id){
  state.wires.forEach(w=>w.selected = (w.id===id));
  draw();
}

document.getElementById('caRotate').addEventListener('click', ()=>{
  const comp = state.components.find(c=>c.id===state.ui.selectedComponent);
  if(!comp) return; comp.rot = ((comp.rot||0)+90)%360; saveLocal(); checkWarningsUI(); refreshWireList(); draw();
});
document.getElementById('caMirror').addEventListener('click', ()=>{
  const comp = state.components.find(c=>c.id===state.ui.selectedComponent);
  if(!comp) return; comp.mirror = !comp.mirror; saveLocal(); checkWarningsUI(); refreshWireList(); draw();
});
document.getElementById('caDelete').addEventListener('click', ()=>{
  const id = state.ui.selectedComponent;
  if(!id) return;
  showConfirm('Delete this component? Wires connected to it will also be removed.', ()=>removeComponent(id));
});

function updateCompActionsPosition(){
  const box = document.getElementById('comp-actions');
  const comp = state.components.find(c=>c.id===state.ui.selectedComponent);
  if(!comp){ box.classList.remove('show'); return; }
  const holes = componentPinHoles(comp).map(h=>holeToPixel(h.col,h.row));
  let minX=Infinity,minY=Infinity,maxX=-Infinity;
  holes.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); });
  const s1 = worldToScreen(minX,minY);
  box.style.left = clamp(s1.x,8,canvas.clientWidth-160)+'px';
  box.style.top = Math.max(8, s1.y-52)+'px';
  box.classList.add('show');
}

/* ---------------------------------------------------------------------
   8. MODALS — alert / confirm / component editor / footprint creator
--------------------------------------------------------------------- */
const modalScrim = document.getElementById('modalScrim');
function showModal(id){ modalScrim.classList.add('show'); document.getElementById(id).classList.add('show'); }
function hideModal(id){ document.getElementById(id).classList.remove('show'); modalScrim.classList.remove('show'); }
modalScrim.addEventListener('click', closeAllModals);
function closeAllModals(){
  ['compModal','wireModal','fpModal','alertModal','confirmModal'].forEach(id=>document.getElementById(id).classList.remove('show'));
  modalScrim.classList.remove('show');
}

function showAlert(msg){
  document.getElementById('alertModalMsg').textContent = msg;
  showModal('alertModal');
}
document.getElementById('alertModalOk').addEventListener('click', ()=>hideModal('alertModal'));

let confirmCallback = null;
function showConfirm(msg, onOk){
  document.getElementById('confirmModalMsg').textContent = msg;
  confirmCallback = onOk;
  showModal('confirmModal');
}
document.getElementById('confirmModalCancel').addEventListener('click', ()=>{ hideModal('confirmModal'); confirmCallback=null; });
document.getElementById('confirmModalOk').addEventListener('click', ()=>{
  const cb = confirmCallback; hideModal('confirmModal'); confirmCallback=null;
  if(cb) cb();
});

/* ---- Component edit modal ---- */
let compModalCompId = null;
function refreshCompModalPreview(){
  const comp = state.components.find(c=>c.id===compModalCompId);
  if(!comp) return;
  const fp = getFootprint(comp.fpId);
  document.getElementById('compModalPreview').innerHTML = footprintPreviewSvg(fp, {rot:comp.rot||0, mirror:comp.mirror||false, labels:true, unit:30});
  const holes = componentPinHoles(comp);
  document.getElementById('compModalPins').innerHTML = holes.map(h=>
    `<div class="pin-edit-row" data-idx="${h.index}">
       <input type="text" class="pin-edit-number" value="${escapeXml(String(h.number))}" placeholder="#">
       <input type="text" class="pin-edit-name" value="${escapeXml(h.name)}" placeholder="Pin name">
       <span class="pin-edit-coord">(${h.col},${h.row})</span>
     </div>`
  ).join('');
  document.querySelectorAll('#compModalPins .pin-edit-number, #compModalPins .pin-edit-name').forEach(inp=>{
    inp.addEventListener('change', function(){
      const comp = state.components.find(c=>c.id===compModalCompId);
      if(!comp) return;
      const idx = parseInt(this.closest('.pin-edit-row').dataset.idx);
      if(!comp.pinOverrides) comp.pinOverrides = {};
      if(!comp.pinOverrides[idx]) comp.pinOverrides[idx] = {};
      if(this.classList.contains('pin-edit-number')) comp.pinOverrides[idx].number = this.value.trim();
      else comp.pinOverrides[idx].name = this.value.trim();
      saveLocal(); checkWarningsUI(); refreshWireList(); draw();
    });
  });
}
function openComponentModal(compId){
  const comp = state.components.find(c=>c.id===compId);
  if(!comp) return;
  compModalCompId = compId;
  document.getElementById('compModalTitle').textContent = comp.label;
  document.getElementById('compModalLabel').value = comp.label;
  document.getElementById('compModalFace').value = comp.face||'front';
  refreshCompModalPreview();
  showModal('compModal');
}
document.getElementById('compModalClose').addEventListener('click', ()=>hideModal('compModal'));
document.getElementById('compModalLabel').addEventListener('change', function(){
  const comp = state.components.find(c=>c.id===compModalCompId);
  if(!comp) return;
  const v = this.value.trim();
  if(v){ comp.label = v; document.getElementById('compModalTitle').textContent = v; saveLocal(); refreshWireList(); draw(); }
  else this.value = comp.label;
});
document.getElementById('compModalFace').addEventListener('change', function(){
  const comp = state.components.find(c=>c.id===compModalCompId);
  if(!comp) return;
  comp.face = this.value;
  saveLocal(); checkWarningsUI(); refreshWireList(); draw();
});
document.getElementById('compModalRotate').addEventListener('click', ()=>{
  const comp = state.components.find(c=>c.id===compModalCompId);
  if(!comp) return; comp.rot = ((comp.rot||0)+90)%360; saveLocal(); checkWarningsUI(); refreshWireList(); refreshCompModalPreview(); draw();
});
document.getElementById('compModalMirror').addEventListener('click', ()=>{
  const comp = state.components.find(c=>c.id===compModalCompId);
  if(!comp) return; comp.mirror = !comp.mirror; saveLocal(); checkWarningsUI(); refreshWireList(); refreshCompModalPreview(); draw();
});
document.getElementById('compModalDelete').addEventListener('click', ()=>{
  const id = compModalCompId;
  if(!id) return;
  showConfirm('Delete this component? Wires connected to it will also be removed.', ()=>{
    hideModal('compModal');
    removeComponent(id);
  });
});

/* ---- Wire edit modal ---- */
let wireModalId = null;
function refreshWireModal(){
  const w = state.wires.find(x=>x.id===wireModalId);
  if(!w) return;
  const pts = w.points;
  const bends = Math.max(0,pts.length-2);
  document.getElementById('wireModalDesc').innerHTML =
    `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${w.color};flex:0 0 auto;"></span>` +
    `<span>${escapeXml(describeWirePoint(pts[0]))} → ${escapeXml(describeWirePoint(pts[pts.length-1]))}${bends?' · '+bends+' bend(s)':''}</span>`;
  document.getElementById('wireModalColor').value = /^#[0-9a-f]{6}$/i.test(w.color) ? w.color : '#3763e8';
  document.getElementById('wireModalFace').value = w.face;
}
function openWireModal(id){
  const w = state.wires.find(x=>x.id===id);
  if(!w) return;
  wireModalId = id;
  selectWire(id);
  refreshWireModal();
  showModal('wireModal');
}
function closeWireModal(){ hideModal('wireModal'); selectWire(null); }
document.getElementById('wireModalClose').addEventListener('click', closeWireModal);
document.getElementById('wireModalDone').addEventListener('click', closeWireModal);
document.getElementById('wireModalColor').addEventListener('input', function(){
  const w = state.wires.find(x=>x.id===wireModalId);
  if(!w) return;
  w.color = this.value;
  saveLocal(); refreshWireList(); refreshWireModal(); draw();
});
document.getElementById('wireModalRandom').addEventListener('click', ()=>{
  const w = state.wires.find(x=>x.id===wireModalId);
  if(!w) return;
  w.color = randomWireColor();
  saveLocal(); refreshWireList(); refreshWireModal(); draw();
});
document.getElementById('wireModalFace').addEventListener('change', function(){
  const w = state.wires.find(x=>x.id===wireModalId);
  if(!w) return;
  w.face = this.value;
  saveLocal(); checkWarningsUI(); refreshWireList(); draw();
});
document.getElementById('wireModalDelete').addEventListener('click', ()=>{
  const id = wireModalId;
  if(!id) return;
  hideModal('wireModal');
  removeWire(id);
});

/* ---- Custom footprint creation modal ---- */
function updateFpModalPreview(){
  const top = clamp(parseInt(document.getElementById('fpTop').value)||0,0,60);
  const bottom = clamp(parseInt(document.getElementById('fpBottom').value)||0,0,60);
  const pitch = clamp(parseInt(document.getElementById('fpPitch').value)||1,1,10);
  const rowGap = clamp(parseInt(document.getElementById('fpRowGap').value)||3,1,20);
  const namesTop = document.getElementById('fpNamesTop').value.split(',').map(s=>s.trim()).filter(Boolean);
  const namesBottom = document.getElementById('fpNamesBottom').value.split(',').map(s=>s.trim()).filter(Boolean);
  const numbersTop = document.getElementById('fpNumbersTop').value.split(',').map(s=>s.trim()).filter(Boolean);
  const numbersBottom = document.getElementById('fpNumbersBottom').value.split(',').map(s=>s.trim()).filter(Boolean);
  const pins=[];
  for(let i=0;i<top;i++) pins.push({name:namesTop[i]||('T'+(i+1)), number:numbersTop[i]||String(i+1), dx:i*pitch, dy:0});
  for(let i=0;i<bottom;i++) pins.push({name:namesBottom[i]||('B'+(i+1)), number:numbersBottom[i]||String(top+i+1), dx:i*pitch, dy:rowGap});
  const preview = document.getElementById('fpModalPreview');
  if(!pins.length){ preview.innerHTML = '<span class="empty-note">Add at least one pin</span>'; return; }
  fpEditorPins = pins;
  preview.innerHTML = footprintPreviewSvg({pins, bodyPad:0.32, body:fpBodyDraft||undefined}, {labels:true, unit:30, editor:true, body:fpBodyDraft||undefined, bounds:fpFrozenBounds||undefined});
}

/* body rectangle editing: drag the body to move it, drag a blue corner to resize it */
let fpBodyDraft = null;      // null = automatic body derived from the pins
let fpEditorPins = [];
let fpFrozenBounds = null;   // keeps the preview layout stable while dragging
let fpDrag = null;
(function(){
  const box = document.getElementById('fpModalPreview');
  const snap = v=>Math.round(v*4)/4; // quarter-cell steps
  function toCells(e){
    const svg = box.querySelector('svg'); if(!svg||!lastPreviewGeom) return null;
    const r = svg.getBoundingClientRect(); const g = lastPreviewGeom;
    const k = g.w / r.width;
    return {x:((e.clientX-r.left)*k - g.padd)/g.unit + g.minX, y:((e.clientY-r.top)*k - g.padd)/g.unit + g.minY};
  }
  box.addEventListener('pointerdown', e=>{
    const h = e.target.getAttribute && e.target.getAttribute('data-h');
    if(!h) return;
    const c = toCells(e); if(!c) return;
    e.preventDefault();
    if(!fpBodyDraft){ const b = footprintBody({pins:fpEditorPins, bodyPad:0.32}); fpBodyDraft = {x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1}; }
    const g = lastPreviewGeom;
    fpFrozenBounds = {minX:g.minX,minY:g.minY,maxX:g.maxX,maxY:g.maxY};
    fpDrag = {h, start:c, orig:{...fpBodyDraft}};
  });
  window.addEventListener('pointermove', e=>{
    if(!fpDrag) return;
    const c = toCells(e); if(!c) return;
    const o = fpDrag.orig, d = {...o}, MIN=0.5;
    const dx = c.x-fpDrag.start.x, dy = c.y-fpDrag.start.y;
    if(fpDrag.h==='move'){ d.x0=snap(o.x0+dx); d.x1=d.x0+(o.x1-o.x0); d.y0=snap(o.y0+dy); d.y1=d.y0+(o.y1-o.y0); }
    else {
      if(fpDrag.h.includes('w')) d.x0 = Math.min(snap(o.x0+dx), o.x1-MIN);
      if(fpDrag.h.includes('e')) d.x1 = Math.max(snap(o.x1+dx), o.x0+MIN);
      if(fpDrag.h.includes('n')) d.y0 = Math.min(snap(o.y0+dy), o.y1-MIN);
      if(fpDrag.h.includes('s')) d.y1 = Math.max(snap(o.y1+dy), o.y0+MIN);
    }
    fpBodyDraft = d;
    updateFpModalPreview();
  });
  function end(){ if(!fpDrag) return; fpDrag=null; fpFrozenBounds=null; updateFpModalPreview(); }
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  document.getElementById('fpBodyReset').addEventListener('click', ()=>{ fpBodyDraft=null; fpFrozenBounds=null; updateFpModalPreview(); });
})();
['fpTop','fpBottom','fpPitch','fpRowGap','fpNamesTop','fpNamesBottom','fpNumbersTop','fpNumbersBottom'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateFpModalPreview);
});
let fpEditingId = null;
function decomposeFootprintForForm(fp){
  const pins = fp.pins||[];
  if(!pins.length) return {top:0,bottom:0,pitch:1,rowGap:3,namesTop:[],namesBottom:[],numbersTop:[],numbersBottom:[]};
  const dys = [...new Set(pins.map(p=>p.dy))].sort((a,b)=>a-b);
  const topDy = dys[0];
  const bottomDy = dys.length>1 ? dys[1] : null;
  const topPins = pins.filter(p=>p.dy===topDy).sort((a,b)=>a.dx-b.dx);
  const bottomPins = bottomDy!==null ? pins.filter(p=>p.dy===bottomDy).sort((a,b)=>a.dx-b.dx) : [];
  function pitchOf(list){ return list.length>1 ? (list[1].dx-list[0].dx)||1 : 0; }
  const pitch = pitchOf(topPins) || pitchOf(bottomPins) || 1;
  return {
    top: topPins.length,
    bottom: bottomPins.length,
    pitch,
    rowGap: bottomDy!==null ? (bottomDy-topDy) : 3,
    namesTop: topPins.map(p=>p.name),
    namesBottom: bottomPins.map(p=>p.name),
    numbersTop: topPins.map(p=>String(p.number!==undefined?p.number:'')),
    numbersBottom: bottomPins.map(p=>String(p.number!==undefined?p.number:''))
  };
}
function openFpModalForEdit(id){
  const fp = state.customFootprints[id];
  if(!fp) return;
  fpEditingId = id;
  const d = decomposeFootprintForForm(fp);
  fpBodyDraft = fp.body ? {...fp.body} : null; fpFrozenBounds = null;
  document.getElementById('fpModalTitle').textContent = 'Edit custom component';
  document.getElementById('fpModalSave').textContent = 'Save changes';
  document.getElementById('fpModalDelete').style.display = 'block';
  document.getElementById('fpName').value = fp.name;
  document.getElementById('fpTop').value = d.top;
  document.getElementById('fpBottom').value = d.bottom;
  document.getElementById('fpPitch').value = d.pitch;
  document.getElementById('fpRowGap').value = d.rowGap;
  document.getElementById('fpNamesTop').value = d.namesTop.join(', ');
  document.getElementById('fpNamesBottom').value = d.namesBottom.join(', ');
  document.getElementById('fpNumbersTop').value = d.numbersTop.join(', ');
  document.getElementById('fpNumbersBottom').value = d.numbersBottom.join(', ');
  updateFpModalPreview();
  closeDrawer();
  showModal('fpModal');
}
document.getElementById('fpNewBtn').addEventListener('click', ()=>{
  fpEditingId = null; fpBodyDraft = null; fpFrozenBounds = null;
  document.getElementById('fpModalTitle').textContent = 'New custom component';
  document.getElementById('fpModalSave').textContent = 'Add to library';
  document.getElementById('fpModalDelete').style.display = 'none';
  document.getElementById('fpName').value='';
  document.getElementById('fpTop').value=4;
  document.getElementById('fpBottom').value=0;
  document.getElementById('fpPitch').value=1;
  document.getElementById('fpRowGap').value=3;
  document.getElementById('fpNamesTop').value='';
  document.getElementById('fpNamesBottom').value='';
  document.getElementById('fpNumbersTop').value='';
  document.getElementById('fpNumbersBottom').value='';
  updateFpModalPreview();
  closeDrawer();
  showModal('fpModal');
});
document.getElementById('fpModalClose').addEventListener('click', ()=>hideModal('fpModal'));
document.getElementById('fpModalCancel').addEventListener('click', ()=>hideModal('fpModal'));
document.getElementById('fpModalSave').addEventListener('click', function(){
  const name = document.getElementById('fpName').value.trim();
  if(!name){ showAlert('Please give the component a name.'); return; }
  const top = clamp(parseInt(document.getElementById('fpTop').value)||0,0,60);
  const bottom = clamp(parseInt(document.getElementById('fpBottom').value)||0,0,60);
  const pitch = clamp(parseInt(document.getElementById('fpPitch').value)||1,1,10);
  const rowGap = clamp(parseInt(document.getElementById('fpRowGap').value)||3,1,20);
  if(top+bottom===0){ showAlert('Add at least one pin.'); return; }
  const namesTop = document.getElementById('fpNamesTop').value.split(',').map(s=>s.trim()).filter(Boolean);
  const namesBottom = document.getElementById('fpNamesBottom').value.split(',').map(s=>s.trim()).filter(Boolean);
  const numbersTop = document.getElementById('fpNumbersTop').value.split(',').map(s=>s.trim()).filter(Boolean);
  const numbersBottom = document.getElementById('fpNumbersBottom').value.split(',').map(s=>s.trim()).filter(Boolean);
  const pins=[];
  for(let i=0;i<top;i++) pins.push({name:namesTop[i]||('T'+(i+1)), number:numbersTop[i]||String(i+1), dx:i*pitch, dy:0});
  for(let i=0;i<bottom;i++) pins.push({name:namesBottom[i]||('B'+(i+1)), number:numbersBottom[i]||String(top+i+1), dx:i*pitch, dy:rowGap});
  const id = fpEditingId || uid('custom');
  state.customFootprints[id] = {id, name, pins, kind:'custom', bodyPad:0.32, custom:true};
  if(fpBodyDraft) state.customFootprints[id].body = {x0:fpBodyDraft.x0,y0:fpBodyDraft.y0,x1:fpBodyDraft.x1,y1:fpBodyDraft.y1};
  saveLocal();
  renderCustomFpList();
  checkWarningsUI(); refreshWireList(); draw();
  hideModal('fpModal');
  statusPill(fpEditingId ? 'Component updated' : 'Added to library');
  fpEditingId = null;
});
document.getElementById('fpModalDelete').addEventListener('click', function(){
  const id = fpEditingId;
  if(!id) return;
  if(state.components.some(c=>c.fpId===id)){ showAlert('This component is used on the board — remove it first.'); return; }
  showConfirm('Delete this custom component from the library?', ()=>{
    delete state.customFootprints[id];
    saveLocal();
    renderCustomFpList();
    hideModal('fpModal');
    fpEditingId = null;
  });
});

/* ---------------------------------------------------------------------
   9. UI — drawer, tabs, toolbar, library, lists
--------------------------------------------------------------------- */
const drawer = document.getElementById('drawer');
const scrim = document.getElementById('scrim');
function openDrawer(){ drawer.classList.add('show'); scrim.classList.add('show'); }
function closeDrawer(){ drawer.classList.remove('show'); scrim.classList.remove('show'); }
document.getElementById('menuBtn').addEventListener('click', openDrawer);
document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('.tool-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.ui.tool = btn.dataset.tool;
    if(state.ui.drawingWire && state.ui.tool!=='wire') finishDrawingWire();
    if(btn.dataset.tool!=='select') state.ui.selectedFootprintToPlace=null;
    selectComponent(null);
  });
});

document.getElementById('zoomIn').addEventListener('click', ()=>{ state.view.zoom=clamp(state.view.zoom*1.25,0.15,4); draw(); });
document.getElementById('zoomOut').addEventListener('click', ()=>{ state.view.zoom=clamp(state.view.zoom*0.8,0.15,4); draw(); });
document.getElementById('zoomFit').addEventListener('click', fitBoardToView);

document.querySelectorAll('#face-toggle button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#face-toggle button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.view.face = btn.dataset.face;
    updateCurrentFaceLabel();
    draw();
  });
});

/* ---- View panel ---- */
function updateCurrentFaceLabel(){
  const el = document.getElementById('vCurrentFace');
  if(el) el.textContent = state.view.face==='front' ? 'front' : 'back';
}
const VIEW_OPT_MAP = {
  vShowPinNumbers: 'showPinNumbers',
  vShowPinNames: 'showPinNames',
  vShowCompLabels: 'showCompLabels',
  vShowWires: 'showWires',
  vShowOtherComponents: 'showOtherSideComponents',
  vShowOtherWires: 'showOtherSideWires',
  vOpaqueBodies: 'opaqueBodies'
};
Object.keys(VIEW_OPT_MAP).forEach(id=>{
  const el = document.getElementById(id);
  el.addEventListener('change', function(){
    state.viewOpts[VIEW_OPT_MAP[id]] = this.checked;
    saveLocal();
    draw();
  });
});
function loadViewFormFromState(){
  Object.keys(VIEW_OPT_MAP).forEach(id=>{
    document.getElementById(id).checked = !!state.viewOpts[VIEW_OPT_MAP[id]];
  });
  updateCurrentFaceLabel();
}

document.getElementById('wRandomColor').addEventListener('change', function(){
  document.getElementById('wManualColorField').style.display = this.checked? 'none':'block';
});

/* ---- Board panel ---- */
function loadBoardFormFromState(){
  document.getElementById('bColsInput').value = state.board.cols;
  document.getElementById('bRowsInput').value = state.board.rows;
  document.getElementById('bSpacingMm').value = state.board.spacingMm;
  document.getElementById('bGapRow').value = state.board.gapRow;
  document.getElementById('bGapCol').value = state.board.gapCol;
  document.getElementById('bGapRowWidth').value = state.board.gapRowWidth||1;
  document.getElementById('bGapColWidth').value = state.board.gapColWidth||1;
  document.getElementById('bLinkFront').value = state.board.linkFront;
  document.getElementById('bLinkBack').value = state.board.linkBack;
  document.getElementById('bRailTop').checked = !!state.board.railTop;
  document.getElementById('bRailBottom').checked = !!state.board.railBottom;
}
document.getElementById('bApplyBtn').addEventListener('click', function(){
  const cols = clamp(parseInt(document.getElementById('bColsInput').value)||30,2,200);
  const rows = clamp(parseInt(document.getElementById('bRowsInput').value)||20,2,200);
  const gapRow = clamp(parseInt(document.getElementById('bGapRow').value)||0,0,rows-1);
  const gapCol = clamp(parseInt(document.getElementById('bGapCol').value)||0,0,cols-1);
  const gapRowWidth = clamp(parseInt(document.getElementById('bGapRowWidth').value)||1,1,5);
  const gapColWidth = clamp(parseInt(document.getElementById('bGapColWidth').value)||1,1,5);
  const newTotalCols = cols + (gapCol>0 ? gapColWidth : 0);
  const newTotalRows = rows + (gapRow>0 ? gapRowWidth : 0);
  const outOfBounds = state.components.some(c=>{
    const b2 = componentBounds(c);
    return b2.minC<0||b2.maxC>=newTotalCols||b2.minR<0||b2.maxR>=newTotalRows;
  }) || state.wires.some(w=>w.points.some(pt=>{
    const h = resolveWirePoint(pt); return h && (h.col<0||h.col>=newTotalCols||h.row<0||h.row>=newTotalRows);
  }));
  function apply(){
    state.board.cols=cols; state.board.rows=rows;
    state.board.spacingMm = parseFloat(document.getElementById('bSpacingMm').value)||2.54;
    state.board.gapRow=gapRow; state.board.gapCol=gapCol;
    state.board.gapRowWidth=gapRowWidth; state.board.gapColWidth=gapColWidth;
    state.board.linkFront = document.getElementById('bLinkFront').value;
    state.board.linkBack = document.getElementById('bLinkBack').value;
    state.board.railTop = document.getElementById('bRailTop').checked;
    state.board.railBottom = document.getElementById('bRailBottom').checked;

    state.components = state.components.filter(c=>{ const b2=componentBounds(c); return b2.minC>=0&&b2.maxC<newTotalCols&&b2.minR>=0&&b2.maxR<newTotalRows; });
    state.wires = state.wires.filter(w=>w.points.every(pt=>{ if(pt.ref==='free') return true; const h=resolveWirePoint(pt); return h && h.col>=0&&h.col<newTotalCols&&h.row>=0&&h.row<newTotalRows; }));

    saveLocal(); refreshWireList(); checkWarningsUI(); fitBoardToView();
    statusPill('Board updated');
  }
  if(outOfBounds) showConfirm('Some components/wires would fall outside the new grid and will be removed. Continue?', apply);
  else apply();
});

/* ---- Library panel ---- */
function renderLibrary(){
  const grid = document.getElementById('libGrid');
  grid.innerHTML='';
  STD_LIBRARY.forEach(fp=>{
    const div = document.createElement('div');
    div.className='lib-item';
    div.innerHTML = footprintPreviewSvg(fp,{labels:false,unit:16}) + `<div class="name">${fp.name}</div><div class="pins">${fp.pins.length} pins</div>`;
    div.addEventListener('click', ()=>{
      document.querySelector('.tool-btn[data-tool="select"]').click();
      state.ui.selectedFootprintToPlace = fp.id;
      closeDrawer();
      statusPill('Tap the board to place "'+fp.name+'"', 2600);
    });
    grid.appendChild(div);
  });
}
function renderCustomFpList(){
  const list = document.getElementById('customFpList');
  const ids = Object.keys(state.customFootprints);
  document.getElementById('customFpCount').textContent = ids.length;
  list.innerHTML='';
  ids.forEach(id=>{
    const fp = state.customFootprints[id];
    const div = document.createElement('div');
    div.className='list-item';
    div.innerHTML = `<div class="txt"><b>${fp.name}</b>${fp.pins.length} pins</div>`;
    const placeBtn = document.createElement('button');
    placeBtn.textContent='➕';
    placeBtn.title='Place on board';
    placeBtn.addEventListener('click', ()=>{ document.querySelector('.tool-btn[data-tool="select"]').click(); state.ui.selectedFootprintToPlace=id; closeDrawer(); statusPill('Tap the board to place "'+fp.name+'"',2600); });
    const editBtn = document.createElement('button');
    editBtn.textContent='✎';
    editBtn.title='Edit (updates every placed instance too)';
    editBtn.addEventListener('click', ()=>{ openFpModalForEdit(id); });
    const delBtn = document.createElement('button');
    delBtn.innerHTML='✕';
    delBtn.addEventListener('click', ()=>{
      if(state.components.some(c=>c.fpId===id)){ showAlert('This component is used on the board — remove it first.'); return; }
      delete state.customFootprints[id]; saveLocal(); renderCustomFpList();
    });
    div.appendChild(placeBtn); div.appendChild(editBtn); div.appendChild(delBtn);
    list.appendChild(div);
  });
}

/* ---- Wires panel list ---- */
function refreshWireList(){
  const list = document.getElementById('wireList');
  document.getElementById('wireCount').textContent = state.wires.length;
  list.innerHTML='';
  state.wires.forEach(w=>{
    const div = document.createElement('div');
    div.className='list-item';
    const pts = w.points;
    const desc = pts.length? `${describeWirePoint(w.points[0])} → ${describeWirePoint(w.points[w.points.length-1])}` : '';
    div.innerHTML = `<div class="swatch" style="background:${w.color}"></div><div class="txt"><b>${w.face==='front'?'Front side':'Back side'}</b>${desc}${w.points.length>2?' · '+(w.points.length-2)+' bend(s)':''}</div>`;
    const delBtn = document.createElement('button');
    delBtn.innerHTML='✕';
    delBtn.addEventListener('click', ()=>removeWire(w.id));
    div.appendChild(delBtn);
    div.addEventListener('click', (e)=>{ if(e.target===delBtn) return; openWireModal(w.id); });
    list.appendChild(div);
  });
  renderConnectionList();
}

/* ---- Debug panel ---- */
function renderConnectionList(){
  const box = document.getElementById('conn-list');
  if(!box) return;
  const conns = computeConnections();
  document.getElementById('connCount').textContent = conns.length;
  if(!conns.length){ box.innerHTML = '<div class="empty-note">No pin-to-pin connections yet.</div>'; return; }
  box.innerHTML = conns.map(c=>{
    const txt = c.pins.map(p=>`${escapeXml(p.comp.label)} / ${escapeXml(p.h.name)}`).join(' ↔ ');
    return `<div class="net-member"><span>${txt}</span> <span class="badge" style="margin-left:auto;">${c.face} copper</span></div>`;
  }).join('');
}
function renderDebugResult(target, res){
  const box = document.getElementById('debug-result');
  box.classList.remove('empty');
  let html = `<div style="margin-bottom:8px;"><span class="badge">${escapeXml(target.label)}</span></div>`;
  // fixed order (front, back), whatever side is being viewed
  ['front','back'].forEach(face=>{
    const m = res[face];
    if(!m) return;
    const dot = face==='front' ? '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(255,176,32,0.7);margin-right:6px;"></span>' : '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px dashed #8c4fd6;box-sizing:border-box;margin-right:6px;"></span>';
    html += `<div class="section-title" style="margin:10px 0 4px;">${dot}${face} copper <span style="font-weight:400;color:var(--ink-faint);">(parts placed on the ${oppositeFace(face)} are soldered here)</span></div>`;
    html += `<div style="font-size:12px;color:var(--ink-faint);margin-bottom:6px;">${m.holes.length} holes · ${m.pins.length} pins · ${m.wires.length} wires</div>`;
    if(m.pins.length){
      m.pins.forEach(p=>{
        html += `<div class="net-member"><span class="badge">#${p.pinNumber} · ${escapeXml(p.pinName)}</span> ${escapeXml(p.compLabel)} — hole (${p.col},${p.row})</div>`;
      });
    } else {
      html += `<div class="net-member">No component pin attached on this face.</div>`;
    }
  });
  box.innerHTML = html;
}
document.getElementById('dbgNetColors').addEventListener('change', function(){
  state.ui.showNetColors = this.checked; netColorCache=null; draw();
});
function checkWarningsUI(){
  const warns = detectWarnings();
  const box = document.getElementById('warn-list');
  if(!warns.length){ box.innerHTML = '<div class="empty-note">No issues detected.</div>'; return; }
  box.innerHTML = warns.map(w=>`<div class="warn-item">${w}</div>`).join('');
}

/* ---------------------------------------------------------------------
   10. PROJECT — local save, JSON export/import, PNG export, reset
--------------------------------------------------------------------- */
function serializeProject(){
  return JSON.stringify({
    board: state.board,
    components: state.components,
    customFootprints: state.customFootprints,
    wires: state.wires.map(w=>({id:w.id, face:w.face, color:w.color, points:w.points})),
    viewOpts: state.viewOpts
  });
}
function saveLocal(){
  try{ localStorage.setItem('pcb-breadboard-project', serializeProject()); }catch(e){ /* storage unavailable, ignore */ }
}
function loadLocal(){
  try{
    const raw = localStorage.getItem('pcb-breadboard-project');
    if(!raw) return false;
    const data = JSON.parse(raw);
    applyProject(data);
    return true;
  }catch(e){ return false; }
}
function applyProject(data){
  state.board = Object.assign({cols:30,rows:20,spacingMm:2.54,gapRow:0,gapCol:0,gapRowWidth:1,gapColWidth:1,linkFront:'none',linkBack:'none',railTop:false,railBottom:false}, data.board||{});
  state.components = (data.components||[]).map(c=>({face:'front', ...c}));
  state.customFootprints = data.customFootprints||{};
  state.wires = (data.wires||[]).map(w=>({...w, points:toBendPoints(w.points||[]), selected:false}));
  state.viewOpts = Object.assign({showPinNumbers:true, showPinNames:true, showCompLabels:true, showWires:true, showOtherSideComponents:true, showOtherSideWires:true, opaqueBodies:false}, data.viewOpts||{});
  loadBoardFormFromState();
  loadViewFormFromState();
  renderCustomFpList();
  refreshWireList();
  checkWarningsUI();
}
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([serializeProject()], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'breadboard-schematic.json';
  a.click();
});
document.getElementById('importFile').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    try{
      const data = JSON.parse(reader.result);
      applyProject(data);
      saveLocal();
      fitBoardToView();
      statusPill('Project imported');
    }catch(err){ showAlert('Invalid file.'); }
  };
  reader.readAsText(file);
  e.target.value='';
});
document.getElementById('libExportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify({customFootprints: state.customFootprints})], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'component-library.json';
  a.click();
});
document.getElementById('libImportFile').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    try{
      const data = JSON.parse(reader.result);
      // accept either a bare {customFootprints:{...}} library file or a full project export
      const incoming = data.customFootprints || (Object.values(data).every(v=>v && v.pins) ? data : null);
      if(!incoming){ showAlert('This file has no component library to import.'); return; }
      let added = 0;
      Object.values(incoming).forEach(fp=>{
        if(!fp || !Array.isArray(fp.pins)) return;
        const id = uid('custom'); // always a fresh id, so importing only ever appends
        state.customFootprints[id] = {...fp, id, custom:true};
        added++;
      });
      saveLocal();
      renderCustomFpList();
      statusPill(added ? `${added} component(s) added to the library` : 'Nothing to import');
    }catch(err){ showAlert('Invalid file.'); }
  };
  reader.readAsText(file);
  e.target.value='';
});
document.getElementById('exportPngBtn').addEventListener('click', ()=>{
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'breadboard-schematic.png';
  a.click();
});
document.getElementById('resetBtn').addEventListener('click', ()=>{
  showConfirm('Reset the board, placed components and wires? Your custom component library will be kept. This cannot be undone.', ()=>{
    state.board = {cols:30,rows:20,spacingMm:2.54,gapRow:0,gapCol:0,gapRowWidth:1,gapColWidth:1,linkFront:'none',linkBack:'none',railTop:false,railBottom:false};
    state.components=[]; state.wires=[]; state.ui.selectedComponent=null;
    loadBoardFormFromState(); refreshWireList(); checkWarningsUI();
    saveLocal(); fitBoardToView();
    statusPill('Project reset');
  });
});

/* ---------------------------------------------------------------------
   11. PWA — install prompt (light guard, no-op if unsupported)
--------------------------------------------------------------------- */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt=e;
  document.getElementById('installBtn').classList.add('show');
});
document.getElementById('installBtn').addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  document.getElementById('installBtn').classList.remove('show');
});

/* ---------------------------------------------------------------------
   12. INIT
--------------------------------------------------------------------- */
window.addEventListener('resize', resizeCanvas);
function init(){
  renderLibrary();
  loadBoardFormFromState();
  loadViewFormFromState();
  if(!loadLocal()){
    renderCustomFpList(); refreshWireList(); checkWarningsUI();
  }
  resizeCanvas();
  fitBoardToView();
  checkWarningsUI();
}
init();

})();
