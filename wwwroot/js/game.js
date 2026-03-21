// Game Constants
const COLS = 20;
const ROWS = 20;
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
    generator: { cost: 80, color: '#00ced1', symbol: '⚡', hp: 50 },
    decoy: { cost: 150, color: '#FFD700', symbol: '🎯', hp: 300 },
    claymore: { cost: 60, color: '#4A5D23', symbol: '💥', hp: 50, range: 120 }
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
let brainSpawnedThisWave = false;
let savedGrid = null; // Stores defense layout exactly as it was when the wave started
let hoverX = -1;
let hoverY = -1;
let waterEaten = {};
let smokeMap = [];
for (let x=0; x<COLS; x++) { smokeMap[x] = []; for (let y=0; y<ROWS; y++) smokeMap[x][y] = 0; }
let currentDangerMap = null;
let placingClaymore = null;

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
const replayEntrenchBtn = document.getElementById('replayEntrenchBtn');
const tryAgainBtn = document.getElementById('tryAgainBtn');
const nextWaveBtn = document.getElementById('nextWaveBtn');
const rerollBtn = document.getElementById('rerollBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

// Map Generation
function generateTerrain() {
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            terrain[x][y] = 0; // Clear existing, leaving grid defenses intact
        }
    }
    
    // Castle Keep in center (2x2)
    let cx = Math.floor(COLS / 2) - 1;
    let cy = Math.floor(ROWS / 2) - 1;
    terrain[cx][cy] = 3; terrain[cx+1][cy] = 3;
    terrain[cx][cy+1] = 3; terrain[cx+1][cy+1] = 3;

    // Generate clumped natural choke points using random walkers
    let numFeatures = 12; 
    for(let i=0; i<numFeatures; i++) {
        let type = Math.random() > 0.4 ? 2 : 1; 
        let length = 5 + Math.floor(Math.random() * 8); 
        
        let cx = Math.floor(Math.random() * COLS);
        let cy = Math.floor(Math.random() * ROWS);
        
        for(let step = 0; step < length; step++) {
            if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) {
                let cX = Math.floor(COLS / 2) - 1;
                let cY = Math.floor(ROWS / 2) - 1;
                let isCastle = (cx >= cX - 2 && cx <= cX + 3 && cy >= cY - 2 && cy <= cY + 3); // Buffer zone
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
    
    if (placingClaymore) {
        let cx = placingClaymore.x * CELL_SIZE + CELL_SIZE/2;
        let cy = placingClaymore.y * CELL_SIZE + CELL_SIZE/2;
        placingClaymore.facingAngle = Math.atan2(ey - cy, ex - cx);
        draw();
        return;
    }
    
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
    if (placingClaymore) placingClaymore = null; // Cancel placing if mouse leaves
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
    if (cellTerrain === 2 && selectedTool !== 'claymore') {
        log("Cannot build on solid rock!", "error"); return;
    }

    const isWater = cellTerrain === 1;
    
    if (selectedTool === 'remove') {
        if (currentCell) {
            let refund = 0;
            let name = currentCell.type;
            if (DEFENSES[currentCell.type]) {
                refund = Math.floor(DEFENSES[currentCell.type].cost * 0.5);
            } else if (currentCell.type === 'hordeLadder') {
                name = 'Corpse Bridge';
            }
            supplies += refund;
            grid[gx][gy] = null;
            let msg = refund > 0 ? `Demolished ${name}. Refunded ${refund}.` : `Cleared ${name}.`;
            log(msg, "build");
            updateSupplies();
            draw();
        }
    } else {
        if (currentCell) {
            log("Space already occupied!", "error"); return;
        }
        
        if (isWater) {
            log("You can no longer build on water!", "error"); return;
        }
        
        const def = DEFENSES[selectedTool];
        
        if (selectedTool === 'claymore') {
            if (supplies >= def.cost) {
                placingClaymore = { x: gx, y: gy, def: def, facingAngle: 0 };
            } else {
                log("Not enough supplies!", "error");
            }
            return;
        }
        
        if (supplies >= def.cost) {
            supplies -= def.cost;
            grid[gx][gy] = {
                type: selectedTool,
                hp: def.hp,
                capacity: def.capacity,
                cooldown: 0,
                facingAngle: Math.PI / 2, // point down by default
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

canvas.addEventListener('mouseup', (e) => {
    if (phase !== 'entrench') return;
    if (placingClaymore) {
        supplies -= placingClaymore.def.cost;
        let gx = placingClaymore.x;
        let gy = placingClaymore.y;
        
        let triggerCells = getClaymoreTriggerCells(gx, gy, placingClaymore.facingAngle, placingClaymore.def.range);

        grid[gx][gy] = {
            type: 'claymore',
            hp: placingClaymore.def.hp,
            facingAngle: placingClaymore.facingAngle,
            triggerCells: triggerCells,
            triggerCount: 0,
            x: gx,
            y: gy
        };
        log(`Constructed claymore at [${gx},${gy}]`, "build");
        updateSupplies();
        placingClaymore = null;
        draw();
    }
});

function updateSupplies() {
    if (suppliesDisplay.innerText !== supplies.toString()) {
        suppliesDisplay.innerText = supplies;
    }
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
    if (replayBtn) replayBtn.style.display = 'none';
    if (replayEntrenchBtn) replayEntrenchBtn.style.display = 'none';
    if (nextWaveBtn) nextWaveBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'none';
    if (tryAgainBtn) tryAgainBtn.style.display = 'none';
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
    brainSpawnedThisWave = false;
    waterEaten = {};
    for (let x=0; x<COLS; x++) { for (let y=0; y<ROWS; y++) smokeMap[x][y] = 0; }
    
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

if (replayEntrenchBtn) {
    replayEntrenchBtn.addEventListener('click', () => {
        phase = 'entrench';
        phaseDisplay.innerText = "ENTRENCHMENT PHASE";
        phaseDisplay.className = "text-primary font-weight-bold";
        
        startBtn.style.display = 'block';
        rerollBtn.style.display = 'block';
        buildBtns.forEach(b => b.disabled = false);
        
        horde = []; bullets = []; particles = [];
        spawnedHorde = 0; gameOver = false; victory = false; castleExplosion = 0; spawnTicks = 0;
        brainSpawnedThisWave = false;
        
        // Hide battle buttons
        if (replayBtn) replayBtn.style.display = 'none';
        replayEntrenchBtn.style.display = 'none';
        if (tryAgainBtn) tryAgainBtn.style.display = 'none';
        if (nextWaveBtn) nextWaveBtn.style.display = 'none';
        if (restartBtn) restartBtn.style.display = 'none';
        
        log("Entrenchment phase! Build more defenses and launch the same wave!", "build");
        draw();
    });
}

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
    brainSpawnedThisWave = false;
    
    log("Defenses restored! +200 Supplies granted. Fortify your position!", "build");
    draw();
});

nextWaveBtn.addEventListener('click', () => {
    restoreGridState();
    maxHorde = Math.floor(maxHorde * 1.5);
    startWave();
});

restartBtn.addEventListener('click', () => location.reload());

if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        let strippedGrid = [];
        for (let x = 0; x < COLS; x++) {
            strippedGrid[x] = [];
            for (let y = 0; y < ROWS; y++) {
                let cell = grid[x][y];
                if (!cell) {
                    strippedGrid[x][y] = null;
                } else {
                    let copy = Object.assign({}, cell);
                    if (copy.type === 'claymore') {
                        // Strip runtime Map
                        delete copy.recentPasses;
                    }
                    strippedGrid[x][y] = copy;
                }
            }
        }
        
        let scenario = {
            terrain: terrain,
            grid: strippedGrid,
            supplies: supplies,
            maxHorde: maxHorde
        };
        
        let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scenario));
        let dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "horde_scenario.json");
        dlAnchorElem.click();
        log("Scenario exported!", "build");
    });
}

if (importBtn) {
    importBtn.addEventListener('click', () => importFile.click());
    
    importFile.addEventListener('change', (e) => {
        let file = e.target.files[0];
        if (!file) return;
        
        let reader = new FileReader();
        reader.onload = function(evt) {
            try {
                let data = JSON.parse(evt.target.result);
                if (data.terrain && data.grid && data.supplies !== undefined && data.maxHorde) {
                    terrain = data.terrain;
                    supplies = data.supplies;
                    maxHorde = data.maxHorde;
                    
                    grid = [];
                    for (let x = 0; x < COLS; x++) {
                        grid[x] = [];
                        for (let y = 0; y < ROWS; y++) {
                            let cell = data.grid[x][y];
                            if (!cell) {
                                grid[x][y] = null;
                            } else {
                                grid[x][y] = cell;
                                if (cell.type === 'claymore') {
                                    cell.recentPasses = new Map();
                                    cell.triggerCells = getClaymoreTriggerCells(x, y, cell.facingAngle, DEFENSES.claymore.range);
                                }
                            }
                        }
                    }
                    
                    phase = 'entrench';
                    phaseDisplay.innerText = "ENTRENCHMENT PHASE";
                    phaseDisplay.className = "text-primary font-weight-bold";
                    
                    startBtn.style.display = 'block';
                    rerollBtn.style.display = 'block';
                    buildBtns.forEach(b => b.disabled = false);
                    
                    horde = []; bullets = []; particles = [];
                    spawnedHorde = 0; gameOver = false; victory = false; castleExplosion = 0; spawnTicks = 0;
                    brainSpawnedThisWave = false;
                    
                    if (replayBtn) replayBtn.style.display = 'none';
                    if (replayEntrenchBtn) replayEntrenchBtn.style.display = 'none';
                    if (tryAgainBtn) tryAgainBtn.style.display = 'none';
                    if (nextWaveBtn) nextWaveBtn.style.display = 'none';
                    if (restartBtn) restartBtn.style.display = 'none';
                    
                    log("Scenario successfully imported! Prepare your defenses.", "build");
                    updateSupplies();
                    draw();
                } else {
                    log("Invalid scenario file format.", "error");
                }
            } catch(err) {
                log("Error reading scenario file.", "error");
            }
            importFile.value = ''; 
        };
        reader.readAsText(file);
    });
}

// --- GAME LOGIC ---

function getClaymoreTriggerCells(gx, gy, angle, range) {
    let cells = new Set();
    let cx = gx * CELL_SIZE + CELL_SIZE/2;
    let cy = gy * CELL_SIZE + CELL_SIZE/2;
    // Fan is +/- 20 degrees (~0.35 rads)
    let spread = 0.35;
    
    for(let a = angle - spread; a <= angle + spread; a += 0.05) {
        let maxDist = range;
        let steps = 20;
        let lastValidGridX = -1;
        let lastValidGridY = -1;
        
        for(let i=1; i<=steps; i++) {
            let chkX = cx + (Math.cos(a) * range) * (i/steps);
            let chkY = cy + (Math.sin(a) * range) * (i/steps);
            let tx = Math.floor(chkX / CELL_SIZE);
            let ty = Math.floor(chkY / CELL_SIZE);
            
            if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) {
                let cellT = terrain[tx][ty];
                if ((cellT === 2 || cellT === 3) && (tx !== gx || ty !== gy)) break; // block if it hits another rock/wall
                lastValidGridX = tx;
                lastValidGridY = ty;
            } else {
                break;
            }
        }
        if (lastValidGridX !== -1 && (lastValidGridX !== gx || lastValidGridY !== gy)) {
            cells.add(lastValidGridX + ',' + lastValidGridY);
        }
    }
    
    let result = [];
    cells.forEach(c => {
        let parts = c.split(',');
        result.push({x: parseInt(parts[0]), y: parseInt(parts[1])});
    });
    return result;
}

function hasLOS(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, e2;
    while (true) {
        if (x0 < 0 || x0 >= COLS || y0 < 0 || y0 >= ROWS) return false;
        
        let t = terrain[x0][y0];
        let isSmoke = smokeMap[x0][y0] > 0;
        // Line of sight blocked by Rock (2), Castle (3), or Smoke Screen
        if (t === 2 || t === 3 || isSmoke) return false; 
        
        if (x0 === x1 && y0 === y1) break;
        
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
    currentDangerMap = dangerMap;
    return dangerMap;
}

function getFlowField(customTargetX = -1, customTargetY = -1) {
    let dangerMap = getDangerMap();
    let distances = [];
    for (let x = 0; x < COLS; x++) {
        distances[x] = [];
        for (let y = 0; y < ROWS; y++) distances[x][y] = 999999;
    }
    
    let queue = [];
    if (customTargetX !== -1 && customTargetY !== -1) {
        distances[customTargetX][customTargetY] = 0;
        queue.push({x: customTargetX, y: customTargetY});
    } else {
        let cx = Math.floor(COLS / 2) - 1;
        let cy = Math.floor(ROWS / 2) - 1;
        distances[cx][cy] = 0; distances[cx+1][cy] = 0;
        distances[cx][cy+1] = 0; distances[cx+1][cy+1] = 0;
        queue.push({x:cx, y:cy}, {x:cx+1, y:cy}, {x:cx, y:cy+1}, {x:cx+1, y:cy+1});
        
        // Add Decoys as competing 0-distance targets!
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
                if (grid[x][y] && grid[x][y].type === 'decoy') {
                    distances[x][y] = 0;
                    queue.push({x: x, y: y});
                }
            }
        }
    }
    
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
let currentBreachFlowField = null;

function spawnHorde() {
    let side = Math.floor(Math.random() * 4); // 0:Top, 1:Right, 2:Bottom, 3:Left
    let sx, sy;
    if (side === 0) { sx = Math.random()*CANVAS_W; sy = -10; }
    else if (side === 1) { sx = CANVAS_W + 10; sy = Math.random()*CANVAS_H; }
    else if (side === 2) { sx = Math.random()*CANVAS_W; sy = CANVAS_H + 10; }
    else { sx = -10; sy = Math.random()*CANVAS_H; }
    
    let isBrain = false;
    let waveScale = maxHorde / 40; // Wave 1 is ~40
    let brainChance = 0.05 * waveScale; // 5% chance scaling up
    if (!brainSpawnedThisWave && Math.random() < brainChance) {
        isBrain = true;
        brainSpawnedThisWave = true;
    }
    
    if (isBrain) {
        horde.push({
            x: sx, y: sy, hp: 20, speed: 0.3,
            slipTime: 0, slipDirX: 0, slipDirY: 0, spin: 0, frame: 0,
            wigglePhase: Math.random() * Math.PI * 2,
            type: 'brain', lastCommandTick: 0
        });
        log("A mutated BRAIN has spawned! It's slow and weak, but commands the swarm!", "error");
    } else {
        horde.push({
            x: sx, y: sy, hp: 30, speed: 1.0 + Math.random() * 1.5,
            slipTime: 0, slipDirX: 0, slipDirY: 0, spin: 0, frame: 0,
            wigglePhase: Math.random() * Math.PI * 2,
            type: 'grunt', squad: Math.random() > 0.5 ? 'A' : 'B'
        });
    }
    spawnedHorde++;
}

let castleExplosion = 0;
function explodeCastle() {
    if (castleExplosion === 0) {
        log("THE KEEP HAS FALLEN! BOOM!", "error");
        castleExplosion = 1;
        let cX = Math.floor(COLS / 2) - 1;
        let cY = Math.floor(ROWS / 2) - 1;
        for(let i=0; i<300; i++) {
            particles.push({
                x: (cX + 1) * CELL_SIZE, y: (cY + 1) * CELL_SIZE,
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
    
    // Decrease Smoke life
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            if (smokeMap[x][y] > 0) smokeMap[x][y]--;
        }
    }
    
    // Recalculate Flow Field occasionally so they react to broken trenches
    if (spawnTicks % 30 === 0) flowField = getFlowField();
    
    // Dynamic Spawn Interval: The whole wave ALWAYS completes spawning in ~13 seconds (800 frames)
    // For maxHorde=40, it's 20 frames. For maxHorde=60, it's 13 frames. This compresses larger waves to saturate defenses!
    let spawnInterval = Math.max(2, Math.floor(800 / maxHorde));
    
    if (spawnedHorde < maxHorde && spawnTicks % spawnInterval === 0) spawnHorde();
    
    // --- TOWERS & DEFENSES ---
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = grid[x][y];
            if (!cell) continue;

            if (cell.type === 'claymore') {
                if (!cell.recentPasses) cell.recentPasses = new Map();
                
                let isSmoked = false;
                for (let tc of cell.triggerCells) {
                    if (smokeMap[tc.x][tc.y] > 0) { isSmoked = true; break; }
                }
                
                let inZoneThisFrame = new Set();
                for (let h of horde) {
                    let hx = Math.floor((h.x + 10) / CELL_SIZE);
                    let hy = Math.floor((h.y + 10) / CELL_SIZE);
                    for (let tc of cell.triggerCells) {
                        if (tc.x === hx && tc.y === hy) {
                            inZoneThisFrame.add(h); break;
                        }
                    }
                }
                
                for (let h of inZoneThisFrame) {
                    if (!cell.recentPasses.has(h)) cell.recentPasses.set(h, 90); // 1.5 seconds mem
                }
                
                let activePassers = 0;
                for (let [h, time] of cell.recentPasses.entries()) {
                    if (time <= 0 || !horde.includes(h)) {
                        cell.recentPasses.delete(h);
                    } else {
                        cell.recentPasses.set(h, time - 1);
                        activePassers++;
                    }
                }
                
                if (isSmoked && activePassers >= 2) {
                    let cx = x * CELL_SIZE + CELL_SIZE/2;
                    let cy = y * CELL_SIZE + CELL_SIZE/2;
                    
                    log("💥 CLAYMORE DETONATED in the smoke! Sector scrubbed!", "kill");
                    createParticles(cx, cy, 'orange', 150, cell.facingAngle, 0.8);
                    createParticles(cx, cy, 'black', 50, cell.facingAngle, 0.8);
                    
                    for (let i = horde.length - 1; i >= 0; i--) {
                        let h = horde[i];
                        let dx = (h.x + 10) - cx;
                        let dy = (h.y + 10) - cy;
                        let dist = Math.sqrt(dx*dx + dy*dy);
                        
                        if (dist <= DEFENSES.claymore.range) {
                            let angle = Math.atan2(dy, dx);
                            let diff = angle - cell.facingAngle;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            
                            if (Math.abs(diff) <= 0.4) {
                                h.hp -= 500;
                                createParticles(h.x, h.y, 'red', 10);
                                if (h.hp <= 0) {
                                    horde.splice(i, 1); supplies++; totalKills++;
                                    if (totalKills % 10 === 0) log(`Kills: ${totalKills}`, 'kill');
                                }
                            }
                        }
                    }
                    grid[x][y] = null;
                }
            } else if (cell.type === 'oil' && cell.burning) {
                cell.burnTicks--;
                cell.hp -= (50 / 600);
                if (Math.random() < 0.2) createParticles(x*CELL_SIZE + 20, y*CELL_SIZE + 20, 'orange', 3);
                if (cell.hp <= 0 || cell.burnTicks <= 0) {
                    grid[x][y] = null;
                }
            } else if (cell.type === 'maxim') {
                let mx = x * CELL_SIZE + 20;
                let my = y * CELL_SIZE + 20;
                
                // 1. Horde Aggro and Melee Collision
                let dead = false;
                for (let h of horde) {
                    let dx = (h.x + 10) - mx;
                    let dy = (h.y + 10) - my;
                    let adx = Math.abs(dx);
                    let ady = Math.abs(dy);
                    
                    // If moving within 1 cell visually (Aggro Radius)
                    if (adx < 50 && ady < 50) {  
                        if (adx < 28 && ady < 28) {
                            // Touch! Deal damage
                            cell.hp -= 0.5;
                            createParticles(mx + (Math.random()-0.5)*20, my + (Math.random()-0.5)*20, 'brown', 1);
                            h.x += (Math.random() - 0.5) * 1.5; // pushback
                            h.y += (Math.random() - 0.5) * 1.5;
                            if (cell.hp <= 0) {
                                grid[x][y] = null;
                                log("A Maxim gun was overrun and destroyed by the swarm!", 'error');
                                createParticles(mx, my, 'orange', 30);
                                dead = true;
                                break; 
                            }
                        } else {
                            // Aggro! Sucked into melee!
                            h.aggroX = mx;
                            h.aggroY = my;
                        }
                    }
                }
                
                if (dead) continue;
                
                // 2. Turret Targeting and Rotation Logic
                let bestDest = 999999;
                let target = null;
                for (let h of horde) {
                    let hx = Math.floor((h.x+10)/CELL_SIZE);
                    let hy = Math.floor((h.y+10)/CELL_SIZE);
                    
                    // Check if Target is in Line of Sight! Otherwise ignore.
                    if (hasLOS(x, y, hx, hy)) {
                        let hdx = h.x + 10 - mx;
                        let hdy = h.y + 10 - my;
                        let distSq = hdx*hdx + hdy*hdy;
                        if (distSq < DEFENSES.maxim.range*DEFENSES.maxim.range && distSq < bestDest) {
                            bestDest = distSq; target = h;
                        }
                    }
                }
                
                if (target) {
                    let targetDX = target.x + 10 - mx;
                    let targetDY = target.y + 10 - my;
                    let desiredAngle = Math.atan2(targetDY, targetDX);
                    
                    // Smoothly rotate facingAngle towards desiredAngle!
                    let diff = desiredAngle - cell.facingAngle;
                    
                    // Normalize diff to -PI to PI
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    
                    // Turn speed 0.1 radians per frame (~6 degrees per frame)
                    let turnSpeed = 0.08; 
                    if (Math.abs(diff) <= turnSpeed) {
                        cell.facingAngle = desiredAngle; // Snapped!
                    } else {
                        cell.facingAngle += Math.sign(diff) * turnSpeed; // Turning mechanics!
                    }
                    
                    if (cell.cooldown > 0) cell.cooldown--;
                    
                    // Only fire if we are roughly aiming at the target (+- 10 degrees)
                    if (cell.cooldown <= 0 && Math.abs(diff) < 0.2) {
                        let spray = (Math.random() - 0.5) * 0.4; // Recoil spray
                        let fireAngle = cell.facingAngle + spray;
                        bullets.push({
                            x: mx, y: my,
                            vx: Math.cos(fireAngle) * 18, vy: Math.sin(fireAngle) * 18,
                            pierceLeft: DEFENSES.maxim.pierce, dmg: DEFENSES.maxim.dmg,
                            hitList: new Set()
                        });
                        cell.cooldown = DEFENSES.maxim.fireRate + Math.floor(Math.random() * 5);
                        createParticles(mx + Math.cos(cell.facingAngle)*15, my + Math.sin(cell.facingAngle)*15, '#ffcc00', 3);
                    }
                } else {
                    if (cell.cooldown > 0) cell.cooldown--;
                }
            }
        }
    }
    
    // --- BULLETS ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx; b.y += b.vy;
        
        // Obstacle Collision for Bullets (Rocks, Castle)
        let bx = Math.floor(b.x / CELL_SIZE);
        let by = Math.floor(b.y / CELL_SIZE);
        if (bx >= 0 && bx < COLS && by >= 0 && by < ROWS) {
            let t = terrain[bx][by];
            let cellObj = grid[bx][by];
            if (t === 2 || t === 3) {
                b.pierceLeft = 0; 
                createParticles(b.x, b.y, '#888', 5); 
            } else if (cellObj && cellObj.type === 'oil' && !cellObj.burning) {
                cellObj.burning = true;
                cellObj.burnTicks = 600; // 10 seconds tracking
                log("Oil slick ignited by stray bullet!", "wave");
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
                            supplies++;
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
    let fleeMode = (horde.length <= 4 && horde.some(h => h.type === 'brain')) && (spawnedHorde >= maxHorde);
    
    for (let i = horde.length - 1; i >= 0; i--) {
        let h = horde[i];
        h.frame++;
        
        if (fleeMode) {
            // Flee away from center!
            if (h.x + 10 < 0 || h.x > CANVAS_W || h.y + 10 < 0 || h.y > CANVAS_H) {
                horde.splice(i, 1);
                continue;
            }
            let cx_pos = (COLS/2) * CELL_SIZE; let cy_pos = (ROWS/2) * CELL_SIZE;
            let dx = (h.x + 10) - cx_pos; let dy = (h.y + 10) - cy_pos;
            let len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0) {
                h.x += (dx/len) * 3.0; h.y += (dy/len) * 3.0;
            }
            
            if (h.type === 'brain' && h.frame % 30 === 0) {
                createParticles(h.x+10, h.y+10, 'gray', 5);
                if (h.frame % 120 === 0) log("The BRAIN is fleeing! Victory is near...", "wave");
            }
            continue; // Submits to no other game mechanics
        }
        
        let cx = Math.floor((h.x + 10) / CELL_SIZE);
        let cy = Math.floor((h.y + 10) / CELL_SIZE);
        if (cx < 0) cx = 0; if (cx >= COLS) cx = COLS - 1;
        if (cy < 0) cy = 0; if (cy >= ROWS) cy = ROWS - 1;
        
        if (h.type === 'brain') {
            if (h.lightbulbTicks > 0) h.lightbulbTicks--;
            
            let brainDist = (flowField && flowField[cx] && flowField[cx][cy] !== undefined) ? flowField[cx][cy] : 999999;
            let isOnBoard = (cx > 0 && cx < COLS-1 && cy > 0 && cy < ROWS-1);
            
            if (h.frame - (h.lastCommandTick || 0) > 120) {
                h.lastCommandTick = h.frame;
                
                // Check if current breach target still exists
                let targetStillExists = false;
                if (h.breachTarget) {
                    let bx = Math.floor(h.breachTarget.x / CELL_SIZE);
                    let by = Math.floor(h.breachTarget.y / CELL_SIZE);
                    if (grid[bx][by]) {
                        targetStillExists = true;
                    } else {
                        h.breachTarget = null;
                        h.breachCooldown = 900; // HUGE Cooldown so the horde can actually rush the new hole!
                        log("Breach target destroyed! The BRAIN allows the horde to flood in!", "wave");
                    }
                }
                
                if (h.breachCooldown && h.breachCooldown > 0) h.breachCooldown -= 120;
                
                if (!targetStillExists && isOnBoard && (!h.breachCooldown || h.breachCooldown <= 0)) {
                    let minDanger = 999999;
                    let weakPoints = [];
                    for (let xx=0; xx<COLS; xx++) {
                        for (let yy=0; yy<ROWS; yy++) {
                            let cellObj = grid[xx][yy];
                            let cellTerrain = terrain[xx][yy];
                            
                            let isDef = cellObj && (cellObj.type === 'wire' || cellObj.type === 'trench' || cellObj.type === 'generator' || cellObj.type === 'decoy' || cellObj.type === 'moat');
                            let isWater = cellTerrain === 1 && (!cellObj || (cellObj.type !== 'bridge' && cellObj.type !== 'hordeLadder'));
                            
                            if (isDef || isWater) {
                                let danger = currentDangerMap ? currentDangerMap[xx][yy] : 0;
                                if (danger < minDanger) {
                                    minDanger = danger;
                                    weakPoints = [{x: xx, y: yy}];
                                } else if (danger === minDanger) {
                                    weakPoints.push({x: xx, y: yy});
                                }
                            }
                        }
                    }
                    if (weakPoints.length > 0) {
                        // Optimize! Pick the weak point nearest to the Keep (lowest flowField distance)
                        weakPoints.sort((a,b) => {
                             let da = flowField ? flowField[a.x][a.y] : 0;
                             let db = flowField ? flowField[b.x][b.y] : 0;
                             return da - db;
                        });
                        let wp = weakPoints[0]; // Nearest weak point
                        let dcx = wp.x * CELL_SIZE + CELL_SIZE/2;
                        let dcy = wp.y * CELL_SIZE + CELL_SIZE/2;
                        
                        h.breachTarget = {x: dcx, y: dcy};
                        h.lightbulbTicks = 60;
                        createParticles(h.x+10, h.y+10, 'yellow', 15);
                        log("The BRAIN identified a blind spot! Squad B is flanking!", "error");
                    }
                }
                
                // If a target is active, command exactly 1/3 of the horde to breach it
                if (h.breachTarget && isOnBoard) {
                    let bx = Math.floor(h.breachTarget.x / CELL_SIZE);
                    let by = Math.floor(h.breachTarget.y / CELL_SIZE);
                    currentBreachFlowField = getFlowField(bx, by);
                    
                    let numGrunts = 0;
                    let numBreaching = 0;
                    let availableForBreach = [];
                    
                    for (let oh of horde) {
                        if (oh.type !== 'brain') {
                            numGrunts++;
                            let ocx = Math.floor((oh.x+10)/CELL_SIZE);
                            let ocy = Math.floor((oh.y+10)/CELL_SIZE);
                            let distToKeep = (flowField && flowField[ocx] && flowField[ocx][ocy] !== undefined) ? flowField[ocx][ocy] : 9999;
                            
                            if (oh.squad === 'B') {
                                numBreaching++;
                                oh.breaching = 120;
                                oh.aggroTicks = 0;
                            } else if (distToKeep > 15) {
                                availableForBreach.push(oh);
                            }
                        }
                    }
                    
                    let targetBreachers = Math.floor(numGrunts / 3);
                    while (numBreaching < targetBreachers && availableForBreach.length > 0) {
                        let idx = Math.floor(Math.random() * availableForBreach.length);
                        let chosen = availableForBreach.splice(idx, 1)[0];
                        chosen.squad = 'B';
                        chosen.breaching = 120;
                        chosen.aggroTicks = 0;
                        numBreaching++;
                    }
                }
            } else if (!h.breachTarget && isOnBoard) {
                // Meatshield Aura: Pull nearby grunts to protect it if no active breach!
                let bodyguardsAssigned = 0;
                for (let oh of horde) {
                    if (oh.type !== 'brain' && oh.aggroTicks > 0) {
                        let ddx = (oh.x+10) - (h.x+10);
                        let ddy = (oh.y+10) - (h.y+10);
                        if (ddx*ddx + ddy*ddy < 150*150) bodyguardsAssigned++;
                    }
                }
                
                for (let oh of horde) {
                    if (bodyguardsAssigned >= 3) break;
                    if (oh.type !== 'brain' && (!oh.aggroTicks || oh.aggroTicks <= 0)) {
                        let ddx = (oh.x+10) - (h.x+10);
                        let ddy = (oh.y+10) - (h.y+10);
                        let distSq = ddx*ddx + ddy*ddy;
                        if (distSq > 40*40 && distSq < 150*150) {
                            oh.aggroX = h.x + 10 + (Math.random()-0.5)*80;
                            oh.aggroY = h.y + 10 + (Math.random()-0.5)*80;
                            oh.aggroTicks = 15; 
                            bodyguardsAssigned++;
                        }
                    }
                }
            }
        }
        
        let inCell = grid[cx][cy];
        let cellTerrain = terrain[cx][cy];
        
        let wiggleX = Math.cos(h.frame * 0.1 + h.wigglePhase) * 0.5;
        let wiggleY = Math.sin(h.frame * 0.1 + h.wigglePhase) * 0.5;
        
        // Smoke Tactics! If Horde member is in High Danger LOS but no smoke exists here
        if (h.type !== 'brain' && currentDangerMap && currentDangerMap[cx][cy] > 0 && smokeMap[cx][cy] <= 0) {
            // Drop deployment chance down to 0.005/frame (30% per second per unit, scales with mass)
            if (Math.random() < 0.005) {
                smokeMap[cx][cy] = 100; // About 1.6 seconds of thick cover!
                createParticles(h.x + 10, h.y + 10, 'gray', 40);
                log("A frontline horde member sacrificed themselves to throw a Smoke Screen!", "wave");
                horde.splice(i, 1);
                supplies++; // Still get money
                continue;
            }
        }
        
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
             supplies++;
             continue;
        }
        
        // Oil Slick
        if (inCell && inCell.type === 'oil') {
            if (inCell.burning) {
                h.hp -= 5;
                createParticles(h.x, h.y, 'orange', 2);
                if (h.hp <= 0) {
                    horde.splice(i, 1);
                    supplies++; totalKills++;
                    if (totalKills % 10 === 0) log(`Kills: ${totalKills}`, 'kill');
                    continue;
                }
            }
            if (h.slipTime <= 0) {
                h.slipTime = 40; 
                let angle = Math.random() * Math.PI * 2;
                h.slipDirX = Math.cos(angle); h.slipDirY = Math.sin(angle);
            }
        }
        
        let currentSpeed = h.speed;
        if (h.type === 'brain') {
            if (horde.length > 1) {
                currentSpeed = 0.1; // Linger slowly in the back unless alone
            } else {
                currentSpeed = 0.5; // Very slow even when alone!
            }
        }
        
        if (inCell && inCell.type === 'wire') {
            currentSpeed *= DEFENSES.wire.slow;
            
            // Electric Fence Logic!
            let electrified = false;
            let dirs = [[-1,0], [1,0], [0,-1], [0,1]];
            for (let d of dirs) {
                let adjX = cx + d[0]; let adjY = cy + d[1];
                if (adjX >= 0 && adjX < COLS && adjY >= 0 && adjY < ROWS) {
                    if (grid[adjX][adjY] && grid[adjX][adjY].type === 'generator') {
                        electrified = true; break;
                    }
                }
            }
            
            if (electrified) {
                h.hp -= 3; // shock damage per frame (quite heavy)
                if (Math.random() < 0.1) createParticles(h.x, h.y, 'cyan', 2);
                if (h.hp <= 0) {
                    horde.splice(i, 1); supplies++; totalKills++;
                    if (totalKills % 10 === 0) log(`Kills: ${totalKills}`, 'kill');
                    continue; // Skip rest of loop for this horde member
                }
            }
            
            if (h.frame % 10 === 0) {
                inCell.hp -= 2; // Demolishing wire over time
                if (inCell.hp <= 0) {
                    grid[cx][cy] = null;
                    log("BANGALORE! Wire destroyed!", "build");
                    createParticles(cx*CELL_SIZE+20, cy*CELL_SIZE+20, 'orange', 15);
                }
            }
        }
        
        wiggleX = Math.cos(h.frame * 0.1 + h.wigglePhase) * 0.5;
        wiggleY = Math.sin(h.frame * 0.1 + h.wigglePhase) * 0.5;
        
        if (h.slipTime > 0) {
            h.slipTime--; h.spin += 0.3; 
            
            h.x += h.slipDirX * 4; 
            h.y += h.slipDirY * 4;
            
            let scx = Math.floor((h.x + 10) / CELL_SIZE);
            let scy = Math.floor((h.y + 10) / CELL_SIZE);
            if (scx >= 0 && scx < COLS && scy >= 0 && scy < ROWS) {
                 let sT = terrain[scx][scy];
                 let sD = grid[scx][scy];
                 let isWall = sT === 2 || sT === 3 || (sD && (sD.type === 'trench' || sD.type === 'maxim'));
                 let isMoat = sD && sD.type === 'moat';
                 
                 if (isWall) {
                      // Bounce physically!
                      h.x -= h.slipDirX * 4; h.y -= h.slipDirY * 4;
                      h.slipDirX *= -1; h.slipDirY *= -1;
                 } else if (isMoat) {
                      // Fall straight into the moat!
                      sD.capacity--;
                      createParticles(h.x, h.y, 'red', 10);
                      horde.splice(i, 1);
                      supplies++;
                      if (sD.capacity <= 0) {
                          grid[scx][scy] = { type: 'hordeLadder', color: '#ffcc99', symbol: '🪜' };
                          log(`Moat filled! The horde created a makeshift bridge!`, 'error');
                      }
                      continue; 
                 } else if (sD && sD.type === 'wire') {
                      // Barbed wire tangles slipping!
                      h.slipTime -= 3; 
                      h.x -= h.slipDirX * 3; h.y -= h.slipDirY * 3; // Moves sluggishly through wire
                 }
            }
            continue; 
        } else {
            h.spin = 0; 
        }
        
        if (h.breaching && h.breaching > 0) h.breaching--;
        
        let tx = 0, ty = 0, usingAggro = false;
        if (h.aggroX !== undefined) {
            // Horde member has been aggro'd by a nearby Maxim!
            tx = h.aggroX; ty = h.aggroY;
            usingAggro = true;
            // Clear aggro so it must be refreshed next frame by the Maxim scanning it
            if (!h.aggroTicks) {
                h.aggroX = undefined;
                h.aggroY = undefined;
            } else {
                h.aggroTicks--;
                if (h.aggroTicks <= 0) {
                    h.aggroX = undefined;
                    h.aggroY = undefined;
                }
            }
        }
        
        let bestX = cx; let bestY = cy;
        let activeField = (h.breaching > 0 && currentBreachFlowField) ? currentBreachFlowField : flowField;
        
        if (usingAggro) {
            let dx = tx - (h.x + 10);
            let dy = ty - (h.y + 10);
            // Translate the desired vector into the best adjacent grid cell!
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                let pdx = Math.round(dx / Math.max(Math.abs(dx), Math.abs(dy), 1));
                let pdy = Math.round(dy / Math.max(Math.abs(dx), Math.abs(dy), 1));
                let nx = cx + pdx;
                let ny = cy + pdy;
                if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                    bestX = nx; bestY = ny;
                }
            } else {
                // If they are basically at the target coordinates, just stay in cx, cy
                bestX = cx; bestY = cy;
            }
        } else if (flowField) {
            let minD = activeField[cx][cy] !== undefined ? activeField[cx][cy] : 999999;
            
            let dirs = [[-1,0], [0,-1], [0,1], [1,0], [-1,-1], [-1,1], [1,-1], [1,1]];
            for(let d of dirs) {
                let nx = cx + d[0]; let ny = cy + d[1];
                
                if (d[0] !== 0 && d[1] !== 0) {
                    let b1 = false, b2 = false;
                    let nx1 = cx + d[0], ny1 = cy;
                    if (nx1>=0 && nx1<COLS && ny1>=0 && ny1<ROWS) {
                        let ct = terrain[nx1][ny1], cd = grid[nx1][ny1];
                        b1 = ct===2 || (ct===1 && (!cd || (cd.type!=='bridge' && cd.type!=='hordeLadder'))) || (cd && (cd.type==='trench'||cd.type==='moat'||cd.type==='maxim'||cd.type==='generator'||cd.type==='decoy'));
                    }
                    let nx2 = cx, ny2 = cy + d[1];
                    if (nx2>=0 && nx2<COLS && ny2>=0 && ny2<ROWS) {
                        let ct = terrain[nx2][ny2], cd = grid[nx2][ny2];
                        b2 = ct===2 || (ct===1 && (!cd || (cd.type!=='bridge' && cd.type!=='hordeLadder'))) || (cd && (cd.type==='trench'||cd.type==='moat'||cd.type==='maxim'||cd.type==='generator'||cd.type==='decoy'));
                    }
                    if (b1 || b2) continue;
                }
                
                if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                    if (activeField[nx][ny] < minD) {
                        minD = activeField[nx][ny]; bestX = nx; bestY = ny;
                    }
                }
            }
        }
        
        // Regardless of aggro or flowfield, now we evaluate the chosen bestX, bestY target!
        let targetDef = grid[bestX][bestY];
            let targetTerrain = terrain[bestX][bestY];
            
            let isWaterTarget = targetTerrain === 1 && (!targetDef || (targetDef.type !== 'bridge' && targetDef.type !== 'hordeLadder'));
            let isSolidDef = targetDef && (targetDef.type === 'trench' || targetDef.type === 'moat' || targetDef.type === 'maxim' || targetDef.type === 'decoy' || targetDef.type === 'generator');
            
            if (isSolidDef || isWaterTarget) {
                // Cannot move into it, must demolish or sacrifice!
                if (h.type !== 'brain' && isSolidDef && (targetDef.type === 'trench' || targetDef.type === 'maxim' || targetDef.type === 'decoy' || targetDef.type === 'generator')) {
                    targetDef.hp -= 0.5; // Many horde attacking = fast demolition
                    createParticles(bestX*CELL_SIZE+20, bestY*CELL_SIZE+20, 'brown', 1);
                    if (targetDef.hp <= 0) {
                        let msg = "Defense breached by the horde!";
                        if (targetDef.type === 'maxim') msg = "A Maxim Gun was destroyed in melee!";
                        else if (targetDef.type === 'decoy') msg = "The Tactical Decoy has been destroyed!";
                        else if (targetDef.type === 'generator') msg = "A Generator has been taken offline!";
                        else if (targetDef.type === 'trench') msg = "Trench breached by the horde!";
                        grid[bestX][bestY] = null;
                        log(msg, 'error');
                        createParticles(bestX*CELL_SIZE+20, bestY*CELL_SIZE+20, '#888', 20);
                    }
                } else if ((isSolidDef && targetDef.type === 'moat') || isWaterTarget) {
                    if (h.type !== 'brain' && h.frame % 30 === 0) {
                        if (isWaterTarget) {
                            let k = bestX + ',' + bestY;
                            waterEaten[k] = (waterEaten[k] || 0) + 1;
                            createParticles(h.x, h.y, '#1e90ff', 10);
                            horde.splice(i, 1);
                            supplies++;
                            if (waterEaten[k] >= 5) {
                                grid[bestX][bestY] = { type: 'hordeLadder', color: '#ffcc99', symbol: '🪜' };
                                log("The crocodiles are full! The pond became a gruesome bridge!", "error");
                            }
                        } else {
                            targetDef.capacity--;
                            createParticles(h.x, h.y, 'red', 10);
                            horde.splice(i, 1);
                            supplies++;
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
    
    if (spawnedHorde >= maxHorde && horde.length === 0) {
        gameOver = true; victory = true;
        log("WAVE DEFEATED! THE CASTLE STANDS!", "wave"); 
        if (replayBtn) replayBtn.style.display = 'block';
        if (replayEntrenchBtn) replayEntrenchBtn.style.display = 'block';
        if (nextWaveBtn) nextWaveBtn.style.display = 'block';
        if (restartBtn) restartBtn.style.display = 'block';
    }
    updateParticles();
    updateSupplies();
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function createParticles(x, y, color, count, baseAngle = null, spread = null) {
    for (let i = 0; i < count; i++) {
        let vx, vy;
        if (baseAngle !== null && spread !== null) {
            let a = baseAngle + (Math.random() - 0.5) * spread;
            let speed = Math.random() * 5 + 2;
            vx = Math.cos(a) * speed;
            vy = Math.sin(a) * speed;
        } else {
            vx = (Math.random() - 0.5) * 5;
            vy = (Math.random() - 0.5) * 5;
        }
        particles.push({
            x: x, y: y,
            vx: vx, vy: vy,
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
                let isSmoke = smokeMap[gridX][gridY] > 0;
                let isWall = cellT === 2 || cellT === 3 || isSmoke;
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
        let cX = Math.floor(COLS / 2) - 1;
        let cY = Math.floor(ROWS / 2) - 1;
        ctx.fillStyle = '#444'; ctx.fillRect(cX*CELL_SIZE + 10, cY*CELL_SIZE + 10, 2*CELL_SIZE - 20, 2*CELL_SIZE - 20);
        ctx.fillStyle = 'black'; ctx.fillRect(cX*CELL_SIZE + 30, (cY+1)*CELL_SIZE - 10, 20, 20); 
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
                
                if (cell.type === 'maxim') {
                    ctx.save();
                    ctx.translate(px + CELL_SIZE/2, py + CELL_SIZE/2);
                    // The gun natively looks like it points left, so we add Math.PI so it points Right (0 rads)
                    ctx.rotate(cell.facingAngle + Math.PI); 
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fillText(bSym, 0, 0);
                    // Draw a distinct dark barrel so the facing angle is extremely obvious visually
                    ctx.fillStyle = '#222';
                    // We rotated by PI, so positive X is actually backwards for the gun emoji. 
                    // Let's just draw the barrel pointing to the true facingAngle instead.
                    ctx.restore();
                    
                    ctx.save();
                    ctx.translate(px + CELL_SIZE/2, py + CELL_SIZE/2);
                    ctx.rotate(cell.facingAngle);
                    ctx.fillStyle = 'yellow';
                    ctx.fillRect(10, -2, 10, 4); // Barrel
                    ctx.restore();
                } else if (cell.type === 'claymore') {
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fillText(bSym, px + CELL_SIZE/2, py + CELL_SIZE/2);
                    
                    ctx.save();
                    ctx.translate(px + CELL_SIZE/2, py + CELL_SIZE/2);
                    ctx.rotate(cell.facingAngle);
                    ctx.fillStyle = 'rgba(255, 100, 0, 0.4)';
                    ctx.fillRect(8, -8, 8, 16); 
                    ctx.restore();
                    
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
                    for (let c of cell.triggerCells || []) {
                        ctx.fillRect(c.x * CELL_SIZE, c.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    }
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fillText(bSym, px + CELL_SIZE/2, py + CELL_SIZE/2);
                }
                
                if (cell.type === 'moat') {
                    ctx.fillStyle = 'rgba(255,0,0,0.5)';
                    ctx.fillRect(px, py + CELL_SIZE - 5, (cell.capacity / DEFENSES[cell.type].capacity) * CELL_SIZE, 5);
                } else if (cell.type === 'trench' || cell.type === 'oil' || cell.type === 'maxim' || cell.type === 'generator' || cell.type === 'decoy') {
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
         
         if (placingClaymore) {
             let tc = getClaymoreTriggerCells(placingClaymore.x, placingClaymore.y, placingClaymore.facingAngle, placingClaymore.def.range);
             let cx = placingClaymore.x * CELL_SIZE + CELL_SIZE/2;
             let cy = placingClaymore.y * CELL_SIZE + CELL_SIZE/2;
             
             // Draw the fan
             ctx.fillStyle = 'rgba(255, 100, 0, 0.2)';
             ctx.beginPath();
             ctx.moveTo(cx, cy);
             ctx.arc(cx, cy, placingClaymore.def.range, placingClaymore.facingAngle - 0.35, placingClaymore.facingAngle + 0.35);
             ctx.lineTo(cx, cy);
             ctx.fill();
             
             // Draw trigger cells
             ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
             for(let c of tc) {
                 ctx.fillRect(c.x * CELL_SIZE, c.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
             }
             
             ctx.fillStyle = placingClaymore.def.color;
             ctx.fillRect(placingClaymore.x * CELL_SIZE + 2, placingClaymore.y * CELL_SIZE + 2, CELL_SIZE-4, CELL_SIZE-4);
         }
    }
    
    if (phase === 'battle') {
        for (let h of horde) {
            ctx.save();
            ctx.translate(h.x + 10, h.y + 10);
            if (h.spin !== 0) ctx.rotate(h.spin);
            
            if (h.type === 'brain') {
                // Pulsing pink head
                let pulse = Math.sin(h.frame * 0.1) * 3;
                ctx.fillStyle = '#ff69b4';
                ctx.beginPath(); ctx.arc(0, 0, 10 + pulse, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'magenta';
                ctx.beginPath(); ctx.arc(0, 0, 6 + pulse/2, 0, Math.PI*2); ctx.fill();
                // Eyes
                ctx.fillStyle = 'black';
                ctx.fillRect(-5, -5, 2, 2); ctx.fillRect(3, -5, 2, 2);
                
                if (h.lightbulbTicks > 0) {
                    ctx.font = '20px Arial';
                    ctx.fillText('💡', 0, -20);
                }
            } else {
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
            }
            ctx.restore();
            
            ctx.fillStyle = 'red';
            let maxHp = h.type === 'brain' ? 20 : 30;
            ctx.fillRect(h.x, h.y - 4, 20 * (h.hp/maxHp), 2);
        }
        
        ctx.fillStyle = 'yellow';
        for (let b of bullets) {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
            ctx.fillRect(-5, -1, 10, 3); ctx.restore();
        }
        
        // --- DRAW SMOKE OVERLAYS ---
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
                if (smokeMap[x][y] > 0) {
                    ctx.fillStyle = `rgba(120, 120, 120, ${Math.min(0.8, smokeMap[x][y] / 100)})`;
                    ctx.beginPath();
                    let px = x * CELL_SIZE + CELL_SIZE/2;
                    let py = y * CELL_SIZE + CELL_SIZE/2;
                    // Billowing puffy effect
                    ctx.arc(px, py, CELL_SIZE * 0.7, 0, Math.PI*2);
                    ctx.arc(px - 10, py - 10, CELL_SIZE * 0.5, 0, Math.PI*2);
                    ctx.arc(px + 10, py + 10, CELL_SIZE * 0.5, 0, Math.PI*2);
                    ctx.fill();
                }
            }
        }
    }
    
    if (phase === 'battle') {
        for (let h of horde) {
            if (h.type === 'brain' && h.breachTarget) {
                ctx.save();
                ctx.translate(h.breachTarget.x, h.breachTarget.y);
                let pulse = Math.abs(Math.sin(Date.now() / 200)) * 5;
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 15 + pulse, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-20 - pulse, 0); ctx.lineTo(20 + pulse, 0);
                ctx.moveTo(0, -20 - pulse); ctx.lineTo(0, 20 + pulse);
                ctx.stroke();
                ctx.restore();
            }
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
