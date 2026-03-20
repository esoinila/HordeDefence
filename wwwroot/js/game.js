// Game Constants
const COLS = 16;
const ROWS = 16;
const CELL_SIZE = 40;
const CANVAS_W = COLS * CELL_SIZE;
const CANVAS_H = ROWS * CELL_SIZE;

// Defense Types
const DEFENSES = {
    trench: { cost: 20, color: '#8B4513', symbol: '🟫', hp: 200 }, // Tougher to withstand swarms
    wire: { cost: 30, color: '#A9A9A9', symbol: '➰', hp: 100, slow: 0.3 }, 
    maxim: { cost: 150, color: '#2F4F4F', symbol: '🔫', hp: 50, fireRate: 10, range: 250, pierce: 4, dmg: 10 }, // Range drastically reduced!
    moat: { cost: 80, color: '#1a3b3a', symbol: '🐊', capacity: 5 },
    oil:  { cost: 30, color: '#111111', symbol: '🛢️', hp: 50 },
    bridge: { cost: 50, color: '#D2691E', symbol: '🌉', hp: 100 }
};

// Game State
let supplies = 1000;
let phase = 'entrench'; 
let selectedTool = 'trench';
let grid = []; // 2D array [x][y] storing defense object or null
let terrain = []; // 0=grass, 1=water (pond), 2=rock (obstacle), 3=castle
let horde = [];
let bullets = [];
let particles = [];
let spawnTicks = 0;
let totalKills = 0;
let maxHorde = 40; 
let spawnedHorde = 0;
let gameOver = false;
let victory = false;
let savedGrid = null; // Stores defense layout exactly as it was when the wave started
let hoverX = -1;
let hoverY = -1;
let waterEaten = {};

// DOM Elements
const canvas = document.getElementById('gameCanvas');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');
const suppliesDisplay = document.getElementById('suppliesDisplay');
const phaseDisplay = document.getElementById('phaseDisplay');
const logDiv = document.getElementById('battleLog');
const buildBtns = document.querySelectorAll('.build-btn');
const startBtn = document.getElementById('startWaveBtn');
const restartBtn = document.getElementById('restartBtn');
const replayBtn = document.getElementById('replayBtn');
const tryAgainBtn = document.getElementById('tryAgainBtn');
const nextWaveBtn = document.getElementById('nextWaveBtn');
const rerollBtn = document.getElementById('rerollBtn');

// Map Generation
function generateTerrain() {
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            terrain[x][y] = 0; // Clear existing, leaving grid defenses intact
        }
    }
    
    // Castle Keep in center (2x2)
    terrain[7][7] = 3; terrain[8][7] = 3;
    terrain[7][8] = 3; terrain[8][8] = 3;

    // Generate clumped natural choke points using random walkers
    let numFeatures = 12; 
    for(let i=0; i<numFeatures; i++) {
        let type = Math.random() > 0.4 ? 2 : 1; 
        let length = 5 + Math.floor(Math.random() * 8); 
        
        let cx = Math.floor(Math.random() * COLS);
        let cy = Math.floor(Math.random() * ROWS);
        
        for(let step = 0; step < length; step++) {
            if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) {
                let isCastle = (cx >= 6 && cx <= 9 && cy >= 6 && cy <= 9); // Buffer zone
                let isEdge = (cx === 0 || cx === COLS-1 || cy === 0 || cy === ROWS-1);
                if (!isCastle && !isEdge) {
                    terrain[cx][cy] = type;
                }
            }
            // Wander
            cx += (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2);
            cy += (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2);
        }
    }
}

function initMap() {
    for (let x = 0; x < COLS; x++) {
        grid[x] = [];
        terrain[x] = [];
    }
    generateTerrain();
}
initMap();

rerollBtn.addEventListener('click', () => {
    if (phase !== 'entrench') return;
    generateTerrain();
    log("Terrain rerolled! Natural choke points rearranged.", "build");
    draw();
});

// Logging
function log(msg, type = '') {
    const p = document.createElement('p');
    p.className = 'log-' + type;
    p.innerText = `> ${msg}`;
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// Build Menu Interactions
buildBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (phase !== 'entrench') return;
        buildBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTool = btn.dataset.type;
    });
});

// Canvas Interactions
canvas.addEventListener('mousemove', (e) => {
    if (phase !== 'entrench') return;
    const rect = canvas.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    
    let oldX = hoverX;
    let oldY = hoverY;
    hoverX = Math.floor(ex / CELL_SIZE);
    hoverY = Math.floor(ey / CELL_SIZE);
    
    if (hoverX !== oldX || hoverY !== oldY) {
        draw();
    }
});

canvas.addEventListener('mouseout', () => {
    if (phase !== 'entrench') return;
    hoverX = -1; hoverY = -1;
    draw();
});

canvas.addEventListener('mousedown', (e) => {
    if (phase !== 'entrench') return;
    
    const rect = canvas.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    
    const gx = Math.floor(ex / CELL_SIZE);
    const gy = Math.floor(ey / CELL_SIZE);
    
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;
    
    if (gx === 0 || gx === COLS-1 || gy === 0 || gy === ROWS-1) {
        log("Cannot build in the horde spawn zones!", "error");
        return;
    }

    const currentCell = grid[gx][gy];
    const cellTerrain = terrain[gx][gy];
    
    if (cellTerrain === 3) {
        log("Cannot build on the Castle Keep!", "error"); return;
    }
    if (cellTerrain === 2) {
        log("Cannot build on solid rock!", "error"); return;
    }

    const isWater = cellTerrain === 1;
    
    if (selectedTool === 'remove') {
        if (currentCell) {
            const refund = Math.floor(DEFENSES[currentCell.type].cost * 0.5);
            supplies += refund;
            grid[gx][gy] = null;
            log(`Demolished ${currentCell.type}. Refunded ${refund}.`, "build");
            updateSupplies();
            draw();
        }
    } else {
        if (currentCell) {
            log("Space already occupied!", "error"); return;
        }
        
        if (isWater && selectedTool !== 'bridge') {
            log("You can only build a Bridge on water ponds!", "error"); return;
        }
        if (!isWater && selectedTool === 'bridge') {
            log("Bridges must go over water!", "error"); return;
        }
        
        const def = DEFENSES[selectedTool];
        if (supplies >= def.cost) {
            supplies -= def.cost;
            grid[gx][gy] = {
                type: selectedTool,
                hp: def.hp,
                capacity: def.capacity,
                cooldown: 0,
                x: gx,
                y: gy
            };
            log(`Constructed ${selectedTool} at [${gx},${gy}]`, "build");
            updateSupplies();
            draw();
        } else {
            log("Not enough supplies!", "error");
        }
    }
});

function updateSupplies() {
    suppliesDisplay.innerText = supplies;
}

function saveGridState() {
    savedGrid = [];
    for (let x = 0; x < COLS; x++) {
        savedGrid[x] = [];
        for (let y = 0; y < ROWS; y++) {
            if (grid[x][y]) {
                savedGrid[x][y] = Object.assign({}, grid[x][y]);
            } else {
                savedGrid[x][y] = null;
            }
        }
    }
}

function restoreGridState() {
    grid = [];
    for (let x = 0; x < COLS; x++) {
        grid[x] = [];
        for (let y = 0; y < ROWS; y++) {
            if (savedGrid && savedGrid[x][y]) {
                grid[x][y] = Object.assign({}, savedGrid[x][y]);
            } else {
                grid[x][y] = null;
            }
        }
    }
    replayBtn.style.display = 'none';
    nextWaveBtn.style.display = 'none';
    restartBtn.style.display = 'none';
    tryAgainBtn.style.display = 'none';
    log("Defenses restored!", "build");
    draw();
}

function startWave() {
    phase = 'battle';
    phaseDisplay.innerText = "DEFEND THE CASTLE!";
    phaseDisplay.className = "text-danger font-weight-bold";
    startBtn.style.display = 'none';
    rerollBtn.style.display = 'none';
    buildBtns.forEach(b => b.disabled = true);
    
    // Reset battle values
    horde = []; bullets = []; particles = [];
    spawnedHorde = 0; gameOver = false; victory = false; castleExplosion = 0;
    spawnTicks = 0;
    waterEaten = {};
    
    log(`THE HORDE IS APPROACHING! (Wave Size: ${maxHorde})`, "wave");
    requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', () => {
    if (phase === 'entrench') {
        saveGridState();
        startWave();
    }
});

replayBtn.addEventListener('click', () => {
    restoreGridState();
    startWave();
});

tryAgainBtn.addEventListener('click', () => {
    restoreGridState();
    supplies += 200;
    updateSupplies();
    
    phase = 'entrench';
    phaseDisplay.innerText = "ENTRENCHMENT PHASE";
    phaseDisplay.className = "text-primary font-weight-bold";
    
    startBtn.style.display = 'block';
    rerollBtn.style.display = 'block';
    buildBtns.forEach(b => b.disabled = false);
    
    horde = []; bullets = []; particles = [];
    spawnedHorde = 0; gameOver = false; victory = false; castleExplosion = 0; spawnTicks = 0;
    
    log("Defenses restored! +200 Supplies granted. Fortify your position!", "build");
    draw();
});

nextWaveBtn.addEventListener('click', () => {
    restoreGridState();
    maxHorde = Math.floor(maxHorde * 1.5);
    startWave();
});

restartBtn.addEventListener('click', () => location.reload());

// --- GAME LOGIC ---

function hasLOS(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, e2;
    while (true) {
        if (x0 === x1 && y0 === y1) break;
        let t = terrain[x0][y0];
        let d = grid[x0][y0];
        // Line of sight blocked by Rock (2), Castle (3), or Trench
        if (t === 2 || t === 3 || (d && d.type === 'trench')) return false; 
        
        e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return true;
}

function getDangerMap() {
    let dangerMap = [];
    for (let x = 0; x < COLS; x++) {
        dangerMap[x] = [];
        for (let y = 0; y < ROWS; y++) {
            dangerMap[x][y] = 0;
        }
    }
    
    // Find all maxims
    let maxims = [];
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            if (grid[x][y] && grid[x][y].type === 'maxim') {
                maxims.push({x: x, y: y});
            }
        }
    }
    
    // Calculate LOS danger
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            for (let m of maxims) {
                // If in range and has LOS
                let distSq = Math.pow(x - m.x, 2) + Math.pow(y - m.y, 2);
                if (distSq < 100) { // arbitrary tile range
                    if (hasLOS(m.x, m.y, x, y)) {
                        dangerMap[x][y] += 30; // High pathing penalty out in the open!
                    }
                }
            }
        }
    }
    return dangerMap;
}

function getFlowField() {
    let dangerMap = getDangerMap();
    let distances = [];
    for (let x = 0; x < COLS; x++) {
        distances[x] = [];
        for (let y = 0; y < ROWS; y++) distances[x][y] = 999999;
    }
    
    let queue = [];
    distances[7][7] = 0; distances[8][7] = 0;
    distances[7][8] = 0; distances[8][8] = 0;
    queue.push({x:7, y:7}, {x:8, y:7}, {x:7, y:8}, {x:8, y:8});
    
    while(queue.length > 0) {
        let curr = queue.shift();
        let currDist = distances[curr.x][curr.y];
        
        let dirs = [[-1,0], [1,0], [0,-1], [0,1], [-1,-1], [-1,1], [1,-1], [1,1]];
        for(let d of dirs) {
            let nx = curr.x + d[0];
            let ny = curr.y + d[1];
            
            if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                let cellTerrain = terrain[nx][ny];
                let cellDef = grid[nx][ny];
                
                // Purely blocked terrain: Solid rock
                if (cellTerrain === 2) continue; 
                
                // Cost calculations
                let cost = 1; 
                if (d[0] !== 0 && d[1] !== 0) cost = 1.4; // diagonal penalty
                
                // If it's natural water with NO bridge/ladder, it's basically a moat. Huge cost!
                if (cellTerrain === 1 && (!cellDef || (cellDef.type !== 'bridge' && cellDef.type !== 'hordeLadder'))) {
                    cost += 300;
                }
                
                // Block Diagonal Corner Cuts
                if (d[0] !== 0 && d[1] !== 0) {
                    let b1 = false, b2 = false;
                    let nx1 = curr.x + d[0], ny1 = curr.y;
                    if (nx1>=0 && nx1<COLS && ny1>=0 && ny1<ROWS) {
                        let ct = terrain[nx1][ny1], cd = grid[nx1][ny1];
                        b1 = ct===2 || (ct===1 && (!cd || (cd.type!=='bridge' && cd.type!=='hordeLadder'))) || (cd && (cd.type==='trench'||cd.type==='moat'||cd.type==='maxim'));
                    }
                    let nx2 = curr.x, ny2 = curr.y + d[1];
                    if (nx2>=0 && nx2<COLS && ny2>=0 && ny2<ROWS) {
                        let ct = terrain[nx2][ny2], cd = grid[nx2][ny2];
                        b2 = ct===2 || (ct===1 && (!cd || (cd.type!=='bridge' && cd.type!=='hordeLadder'))) || (cd && (cd.type==='trench'||cd.type==='moat'||cd.type==='maxim'));
                    }
                    if (b1 || b2) continue;
                }
                
                if (cellDef) {
                    if (cellDef.type === 'wire') cost += 10;
                    if (cellDef.type === 'oil') cost += 5;
                    // TRENCHES AND MOATS ARE NO LONGER BLOCKED. They have a High Cost! 
                    // This creates a global gradient that funnels horde to the "weakest" block to concentrate attacks!
                    if (cellDef.type === 'trench') cost += 500;
                    if (cellDef.type === 'moat') cost += 300;
                    if (cellDef.type === 'maxim') cost += 1000;
                }
                
                cost += dangerMap[nx][ny]; // Avoid Maxim lines of sight
                
                if (currDist + cost < distances[nx][ny]) {
                    distances[nx][ny] = currDist + cost;
                    queue.push({x: nx, y: ny});
                }
            }
        }
    }
    return distances;
}

let flowField = null;

function spawnHorde() {
    let side = Math.floor(Math.random() * 4); // 0:Top, 1:Right, 2:Bottom, 3:Left
    let sx, sy;
    if (side === 0) { sx = Math.random()*CANVAS_W; sy = -10; }
    else if (side === 1) { sx = CANVAS_W + 10; sy = Math.random()*CANVAS_H; }
    else if (side === 2) { sx = Math.random()*CANVAS_W; sy = CANVAS_H + 10; }
    else { sx = -10; sy = Math.random()*CANVAS_H; }
    
    horde.push({
        x: sx, y: sy, hp: 30, speed: 1.0 + Math.random() * 1.5,
        slipTime: 0, slipDirX: 0, slipDirY: 0, spin: 0, frame: 0,
        wigglePhase: Math.random() * Math.PI * 2
    });
    spawnedHorde++;
}

let castleExplosion = 0;
function explodeCastle() {
    if (castleExplosion === 0) {
        log("THE KEEP HAS FALLEN! BOOM!", "error");
        castleExplosion = 1;
        for(let i=0; i<300; i++) {
            particles.push({
                x: 8 * CELL_SIZE, y: 8 * CELL_SIZE,
                vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
                life: 30 + Math.random() * 50,
                color: Math.random() > 0.5 ? 'red' : 'orange'
            });
        }
    }
}

function update() {
    if (phase === 'entrench') return;
    
    if (gameOver) {
        if (castleExplosion > 0) castleExplosion++;
        updateParticles();
        return;
    }
    
    spawnTicks++;
    // Recalculate Flow Field occasionally so they react to broken trenches
    if (spawnTicks % 30 === 0) flowField = getFlowField();
    
    // Dynamic Spawn Interval: The whole wave ALWAYS completes spawning in ~13 seconds (800 frames)
    // For maxHorde=40, it's 20 frames. For maxHorde=60, it's 13 frames. This compresses larger waves to saturate defenses!
    let spawnInterval = Math.max(2, Math.floor(800 / maxHorde));
    
    if (spawnedHorde < maxHorde && spawnTicks % spawnInterval === 0) spawnHorde();
    
    // --- TOWERS (Maxims) ---
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = grid[x][y];
            if (cell && cell.type === 'maxim') {
                if (cell.cooldown > 0) cell.cooldown--;
                
                if (cell.cooldown <= 0) {
                    let mx = x * CELL_SIZE + 20;
                    let my = y * CELL_SIZE + 20;
                    
                    let bestDest = 999999;
                    let target = null;
                    for (let h of horde) {
                        let hx = Math.floor((h.x+10)/CELL_SIZE);
                        let hy = Math.floor((h.y+10)/CELL_SIZE);
                        
                        // Check if Target is in Line of Sight! Otherwise ignore.
                        if (hasLOS(x, y, hx, hy)) {
                            let dx = h.x + 10 - mx;
                            let dy = h.y + 10 - my;
                            let distSq = dx*dx + dy*dy;
                            if (distSq < DEFENSES.maxim.range*DEFENSES.maxim.range && distSq < bestDest) {
                                bestDest = distSq; target = h;
                            }
                        }
                    }
                    if (target) {
                        let dx = target.x + 10 - mx;
                        let dy = target.y + 10 - my;
                        let angle = Math.atan2(dy, dx);
                        
                        angle += (Math.random() - 0.5) * 0.4; // Recoil spray
                        
                        bullets.push({
                            x: mx, y: my,
                            vx: Math.cos(angle) * 18, vy: Math.sin(angle) * 18,
                            pierceLeft: DEFENSES.maxim.pierce, dmg: DEFENSES.maxim.dmg,
                            hitList: new Set()
                        });
                        cell.cooldown = DEFENSES.maxim.fireRate + Math.floor(Math.random() * 5);
                        createParticles(mx, my, '#ffcc00', 3);
                    }
                }
            }
        }
    }
    
    // --- BULLETS ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx; b.y += b.vy;
        
        // Obstacle Collision for Bullets (Rocks, Trenches, Castle)
        let bx = Math.floor(b.x / CELL_SIZE);
        let by = Math.floor(b.y / CELL_SIZE);
        if (bx >= 0 && bx < COLS && by >= 0 && by < ROWS) {
            let t = terrain[bx][by];
            let d = grid[bx][by];
            if (t === 2 || t === 3 || (d && d.type === 'trench')) {
                b.pierceLeft = 0; 
                createParticles(b.x, b.y, '#888', 5); 
                
                if (d && d.type === 'trench') {
                    d.hp -= 2;
                    if (d.hp <= 0) grid[bx][by] = null;
                }
            }
        }
        
        if (b.pierceLeft > 0) {
            // Collision with Horde
            for (let j = horde.length - 1; j >= 0; j--) {
                let h = horde[j];
                if (!b.hitList.has(h)) {
                    let dx = b.x - (h.x + 10); let dy = b.y - (h.y + 10);
                    if (dx*dx + dy*dy < 400) { 
                        h.hp -= b.dmg;
                        b.hitList.add(h); b.pierceLeft--;
                        createParticles(h.x, h.y, 'red', 4);
                        if (h.hp <= 0) {
                            horde.splice(j, 1);
                            totalKills++; if (totalKills % 10 === 0) log(`Kills: ${totalKills}`, 'kill');
                        }
                        if (b.pierceLeft <= 0) break;
                    }
                }
            }
        }
        
        if (b.pierceLeft <= 0 || b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H) {
            bullets.splice(i, 1);
        }
    }
    
    // --- HORDE MOVEMENT ---
    for (let i = horde.length - 1; i >= 0; i--) {
        let h = horde[i];
        h.frame++;
        
        let cx = Math.floor((h.x + 10) / CELL_SIZE);
        let cy = Math.floor((h.y + 10) / CELL_SIZE);
        
        if (cx < 0) cx = 0; if (cx >= COLS) cx = COLS - 1;
        if (cy < 0) cy = 0; if (cy >= ROWS) cy = ROWS - 1;
        
        let inCell = grid[cx][cy];
        let cellTerrain = terrain[cx][cy];
        
        if (cellTerrain === 3) {
            explodeCastle();
            gameOver = true; 
            replayBtn.style.display = 'block';
            tryAgainBtn.style.display = 'block';
            restartBtn.style.display = 'block';
            return;
        }
        
        if (cellTerrain === 1 && (!inCell || (inCell.type !== 'bridge' && inCell.type !== 'hordeLadder'))) {
             let k = cx + ',' + cy;
             waterEaten[k] = (waterEaten[k] || 0) + 1;
             if (waterEaten[k] >= 5) {
                  grid[cx][cy] = { type: 'hordeLadder', color: '#ffcc99', symbol: '🪜' };
                  log("The crocodiles are full! The pond became a gruesome bridge!", "error");
             } else {
                  createParticles(h.x, h.y, '#1e90ff', 20);
                  if (Math.random() < 0.2) log("A horde member slipped and fell to the crocs!", 'error'); 
             }
             horde.splice(i, 1);
             continue;
        }
        
        // Oil Slick
        if (inCell && inCell.type === 'oil') {
            if (h.slipTime <= 0) {
                h.slipTime = 40; 
                let angle = Math.random() * Math.PI * 2;
                h.slipDirX = Math.cos(angle); h.slipDirY = Math.sin(angle);
            }
        }
        
        let currentSpeed = h.speed;
        if (inCell && inCell.type === 'wire') {
            currentSpeed *= DEFENSES.wire.slow;
            if (h.frame % 10 === 0) {
                inCell.hp -= 2; // Demolishing wire over time
                if (inCell.hp <= 0) {
                    grid[cx][cy] = null;
                    log("BANGALORE! Wire destroyed!", "build");
                    createParticles(cx*CELL_SIZE+20, cy*CELL_SIZE+20, 'orange', 15);
                }
            }
        }
        
        let wiggleX = Math.cos(h.frame * 0.1 + h.wigglePhase) * 0.5;
        let wiggleY = Math.sin(h.frame * 0.1 + h.wigglePhase) * 0.5;
        
        if (h.slipTime > 0) {
            h.slipTime--; h.spin += 0.3; 
            h.x += h.slipDirX * 4; h.y += h.slipDirY * 4;
            continue; 
        } else {
            h.spin = 0; 
        }
        
        if (flowField) {
            let bestX = cx; let bestY = cy;
            let minD = flowField[cx][cy] !== undefined ? flowField[cx][cy] : 999999;
            
            let dirs = [[-1,0], [0,-1], [0,1], [1,0], [-1,-1], [-1,1], [1,-1], [1,1]];
            for(let d of dirs) {
                let nx = cx + d[0]; let ny = cy + d[1];
                
                if (d[0] !== 0 && d[1] !== 0) {
                    let b1 = false, b2 = false;
                    let nx1 = cx + d[0], ny1 = cy;
                    if (nx1>=0 && nx1<COLS && ny1>=0 && ny1<ROWS) {
                        let ct = terrain[nx1][ny1], cd = grid[nx1][ny1];
                        b1 = ct===2 || (ct===1 && (!cd || (cd.type!=='bridge' && cd.type!=='hordeLadder'))) || (cd && (cd.type==='trench'||cd.type==='moat'||cd.type==='maxim'));
                    }
                    let nx2 = cx, ny2 = cy + d[1];
                    if (nx2>=0 && nx2<COLS && ny2>=0 && ny2<ROWS) {
                        let ct = terrain[nx2][ny2], cd = grid[nx2][ny2];
                        b2 = ct===2 || (ct===1 && (!cd || (cd.type!=='bridge' && cd.type!=='hordeLadder'))) || (cd && (cd.type==='trench'||cd.type==='moat'||cd.type==='maxim'));
                    }
                    if (b1 || b2) continue;
                }
                
                if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                    if (flowField[nx][ny] < minD) {
                        minD = flowField[nx][ny]; bestX = nx; bestY = ny;
                    }
                }
            }
            
            // Check if the target cell is a solid blocking defense or natural water
            let targetDef = grid[bestX][bestY];
            let targetTerrain = terrain[bestX][bestY];
            
            let isWaterTarget = targetTerrain === 1 && (!targetDef || (targetDef.type !== 'bridge' && targetDef.type !== 'hordeLadder'));
            let isSolidDef = targetDef && (targetDef.type === 'trench' || targetDef.type === 'moat' || targetDef.type === 'maxim');
            
            if (isSolidDef || isWaterTarget) {
                // Cannot move into it, must demolish or sacrifice!
                if (isSolidDef && (targetDef.type === 'trench' || targetDef.type === 'maxim')) {
                    targetDef.hp -= 0.5; // Many horde attacking = fast demolition
                    createParticles(bestX*CELL_SIZE+20, bestY*CELL_SIZE+20, 'brown', 1);
                    if (targetDef.hp <= 0) {
                        let msg = targetDef.type === 'maxim' ? "A Maxim Gun was destroyed in melee!" : "Trench breached by the horde!";
                        grid[bestX][bestY] = null;
                        log(msg, 'error');
                        createParticles(bestX*CELL_SIZE+20, bestY*CELL_SIZE+20, '#888', 20);
                    }
                } else if ((isSolidDef && targetDef.type === 'moat') || isWaterTarget) {
                    if (h.frame % 30 === 0) {
                        if (isWaterTarget) {
                            let k = bestX + ',' + bestY;
                            waterEaten[k] = (waterEaten[k] || 0) + 1;
                            createParticles(h.x, h.y, '#1e90ff', 10);
                            horde.splice(i, 1);
                            if (waterEaten[k] >= 5) {
                                grid[bestX][bestY] = { type: 'hordeLadder', color: '#ffcc99', symbol: '🪜' };
                                log("The crocodiles are full! The pond became a gruesome bridge!", "error");
                            }
                        } else {
                            targetDef.capacity--;
                            createParticles(h.x, h.y, 'red', 10);
                            horde.splice(i, 1);
                            if (targetDef.capacity <= 0) {
                                grid[bestX][bestY] = { type: 'hordeLadder', color: '#ffcc99', symbol: '🪜' };
                                log(`Moat filled! The horde created a makeshift bridge!`, 'error');
                            }
                        }
                    }
                }
                // Horde stays in place to keep attacking/sacrificing, maybe wiggles slightly
                h.x += wiggleX * 0.2; h.y += wiggleY * 0.2;
            } else {
                // Normal Movement into clear space or wire/oil
                let tx = bestX * CELL_SIZE + 20; let ty = bestY * CELL_SIZE + 20;
                let dx = tx - (h.x + 10); let dy = ty - (h.y + 10);
                let len = Math.sqrt(dx*dx + dy*dy);
                if (len > 1) {
                    h.x += (dx/len) * currentSpeed + wiggleX; h.y += (dy/len) * currentSpeed + wiggleY;
                }
            }
        }
    }
    
    if (spawnedHorde >= maxHorde && horde.length === 0) {
        gameOver = true; victory = true;
        log("WAVE DEFEATED! THE CASTLE STANDS!", "wave"); 
        replayBtn.style.display = 'block';
        nextWaveBtn.style.display = 'block';
        restartBtn.style.display = 'block';
    }
    updateParticles();
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5,
            life: 10 + Math.random() * 15, color: color
        });
    }
}

function drawLineOfSight(gx, gy) {
    let cx = gx * CELL_SIZE + 20;
    let cy = gy * CELL_SIZE + 20;
    let range = DEFENSES.maxim.range;
    
    // Draw sweeping polygon for line of sight
    ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    
    for (let angle = 0; angle <= Math.PI * 2; angle += 0.05) {
        let hitX = cx + Math.cos(angle) * range;
        let hitY = cy + Math.sin(angle) * range;
        
        // Raymarch
        let steps = 40; 
        for (let i = 1; i <= steps; i++) {
            let chkX = cx + (Math.cos(angle) * range) * (i / steps);
            let chkY = cy + (Math.sin(angle) * range) * (i / steps);
            
            let gridX = Math.floor(chkX / CELL_SIZE);
            let gridY = Math.floor(chkY / CELL_SIZE);
            
            if (gridX >= 0 && gridX < COLS && gridY >= 0 && gridY < ROWS) {
                let cellT = terrain[gridX][gridY];
                let cellD = grid[gridX][gridY];
                let isWall = cellT === 2 || cellT === 3 || (cellD && cellD.type === 'trench');
                // Don't count the cell the maxim is literally on!
                if (isWall && (gridX !== gx || gridY !== gy)) {
                    hitX = chkX; hitY = chkY;
                    break;
                }
            } else {
                hitX = chkX; hitY = chkY;
                break; // Screen edge
            }
        }
        ctx.lineTo(hitX, hitY);
    }
    ctx.lineTo(cx, cy);
    ctx.fill();
    
    // Range circle
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
    ctx.beginPath(); ctx.arc(cx, cy, range, 0, Math.PI * 2); ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    
    // Draw Base Terrain
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let t = terrain[x][y];
            let px = x * CELL_SIZE; let py = y * CELL_SIZE;
            
            if (t === 0) {
                ctx.fillStyle = '#4c6344'; 
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                if ((x+y)%2===0) {
                     ctx.fillStyle = '#566e4d'; ctx.fillRect(px+10, py+10, 20, 20);
                }
            } else if (t === 1) {
                ctx.fillStyle = '#4c6344'; ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.fillStyle = '#3a8ebf';
                ctx.beginPath();
                ctx.ellipse(px + 20, py + 20, 15, 12 + Math.abs(px%10), Math.PI/4, 0, Math.PI*2);
                ctx.fill();
            } else if (t === 2) {
                ctx.fillStyle = '#4c6344'; ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.fillStyle = '#666666';
                ctx.beginPath();
                ctx.moveTo(px+10, py+30); ctx.lineTo(px+20, py+5);
                ctx.lineTo(px+35, py+25); ctx.lineTo(px+25, py+35);
                ctx.fill();
                ctx.fillStyle = '#888888';
                ctx.beginPath();
                ctx.moveTo(px+12, py+28); ctx.lineTo(px+20, py+8);
                ctx.lineTo(px+25, py+26); ctx.fill();
            } else if (t === 3) {
                ctx.fillStyle = '#777'; ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = '#555'; ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.strokeRect(px+5, py+5, CELL_SIZE-10, CELL_SIZE-10);
            }
        }
    }
    
    if (!castleExplosion) {
        ctx.fillStyle = '#444'; ctx.fillRect(7*CELL_SIZE + 10, 7*CELL_SIZE + 10, 2*CELL_SIZE - 20, 2*CELL_SIZE - 20);
        ctx.fillStyle = 'black'; ctx.fillRect(7*CELL_SIZE + 30, 8*CELL_SIZE - 10, 20, 20); 
    }
    
    ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = grid[x][y];
            if (cell) {
                let px = x * CELL_SIZE; let py = y * CELL_SIZE;
                
                let bColor = 'gray';
                let bSym = '';
                if (cell.type === 'hordeLadder') {
                    bColor = cell.color || '#8B4513';
                    bSym = cell.symbol || '🪜';
                } else if (DEFENSES[cell.type]) {
                    bColor = DEFENSES[cell.type].color;
                    bSym = DEFENSES[cell.type].symbol;
                }
                
                ctx.fillStyle = bColor;
                ctx.fillRect(px+2, py+2, CELL_SIZE-4, CELL_SIZE-4);
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(bSym, px + CELL_SIZE/2, py + CELL_SIZE/2);
                
                if (cell.type === 'moat') {
                    ctx.fillStyle = 'rgba(255,0,0,0.5)';
                    ctx.fillRect(px, py + CELL_SIZE - 5, (cell.capacity / DEFENSES[cell.type].capacity) * CELL_SIZE, 5);
                } else if (cell.type === 'trench' || cell.type === 'oil' || cell.type === 'maxim') {
                    ctx.fillStyle = 'rgba(0,255,0,0.5)';
                    ctx.fillRect(px, py + CELL_SIZE - 5, (cell.hp / DEFENSES[cell.type].hp) * CELL_SIZE, 5);
                } else if (cell.type === 'hordeLadder') {
                    // It's a ladder bridging the moat!
                }
            }
        }
    }
    
    if (phase === 'entrench') {
         ctx.fillStyle = 'rgba(255,0,0,0.1)';
         ctx.fillRect(0, 0, CANVAS_W, CELL_SIZE);
         ctx.fillRect(0, CANVAS_H - CELL_SIZE, CANVAS_W, CELL_SIZE);
         ctx.fillRect(0, 0, CELL_SIZE, CANVAS_H);
         ctx.fillRect(CANVAS_W - CELL_SIZE, 0, CELL_SIZE, CANVAS_H);
         
         if (hoverX >= 0 && hoverX < COLS && hoverY >= 0 && hoverY < ROWS) {
             let isMaxim = selectedTool === 'maxim';
             if (grid[hoverX][hoverY] && grid[hoverX][hoverY].type === 'maxim') {
                 isMaxim = true; // Hovering over an already built maxim
             }
             if (isMaxim) {
                 drawLineOfSight(hoverX, hoverY);
             }
             
             ctx.strokeStyle = 'rgba(255,255,255,0.5)';
             ctx.strokeRect(hoverX*CELL_SIZE, hoverY*CELL_SIZE, CELL_SIZE, CELL_SIZE);
         }
    }
    
    if (phase === 'battle') {
        for (let h of horde) {
            ctx.save();
            ctx.translate(h.x + 10, h.y + 10);
            if (h.spin !== 0) ctx.rotate(h.spin);
            
            ctx.fillStyle = '#ffcc99'; 
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
            
            ctx.fillStyle = 'black';
            ctx.fillRect(-4, -4, 2, 2); ctx.fillRect(2, -4, 2, 2);
            
            ctx.strokeStyle = h.spin ? 'red' : 'black';
            ctx.beginPath();
            if (h.spin) {
                ctx.arc(0, 4, 3, 0, Math.PI*2); ctx.stroke();
            } else {
                ctx.moveTo(-4, 2); ctx.lineTo(0, 0); ctx.lineTo(4, 2); ctx.stroke();
            }
            ctx.restore();
            
            ctx.fillStyle = 'red';
            ctx.fillRect(h.x, h.y - 4, 20 * (h.hp/30), 2);
        }
        
        ctx.fillStyle = 'yellow';
        for (let b of bullets) {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
            ctx.fillRect(-5, -1, 10, 3); ctx.restore();
        }
    }
    
    for (let p of particles) {
        ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4);
    }

    if (castleExplosion > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${0.8 - (castleExplosion/100)})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = 'white'; ctx.font = 'bold 48px Courier New';
        ctx.fillText("THE KEEP FELL!", CANVAS_W/2, CANVAS_H/2);
    }
    if (victory) {
        ctx.fillStyle = `rgba(0, 255, 0, 0.4)`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = 'white'; ctx.font = 'bold 48px Courier New';
        ctx.fillText("VICTORY!", CANVAS_W/2, CANVAS_H/2);
    }
}

function gameLoop() {
    update(); draw();
    if (!gameOver || castleExplosion > 0 && castleExplosion < 100) {
        requestAnimationFrame(gameLoop);
    }
}

draw();
