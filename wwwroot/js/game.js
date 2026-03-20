// Game Constants
const COLS = 20;
const ROWS = 10;
const CELL_SIZE = 40;
const CANVAS_W = COLS * CELL_SIZE;
const CANVAS_H = ROWS * CELL_SIZE;

// Defense Types
const DEFENSES = {
    trench: { cost: 50, color: '#8B4513', symbol: '🟫', hp: 100 },
    wire: { cost: 75, color: '#A9A9A9', symbol: '➰', hp: 50, slow: 0.3 },
    maxim: { cost: 200, color: '#2F4F4F', symbol: '🔫', hp: 50, fireRate: 30, range: 800, pierce: 7, dmg: 20 },
    moat: { cost: 150, color: '#111111', symbol: '🕳️', capacity: 5 }
};

// Game State
let supplies = 1000;
let phase = 'entrench'; // entrench, battle, end
let selectedTool = 'trench';
let grid = []; // 2D array [x][y] storing defense object or null
let horde = [];
let bullets = [];
let particles = [];
let ticks = 0;
let waveCount = 0;
let totalKills = 0;
let maxHorde = 50;
let spawnedHorde = 0;
let gameOver = false;

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const suppliesDisplay = document.getElementById('suppliesDisplay');
const phaseDisplay = document.getElementById('phaseDisplay');
const logDiv = document.getElementById('battleLog');
const buildBtns = document.querySelectorAll('.build-btn');
const startBtn = document.getElementById('startWaveBtn');
const restartBtn = document.getElementById('restartBtn');

// Initialize Grid
for (let x = 0; x < COLS; x++) {
    grid[x] = [];
    for (let y = 0; y < ROWS; y++) {
        grid[x][y] = null;
    }
}

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
canvas.addEventListener('mousedown', (e) => {
    if (phase !== 'entrench') return;
    
    const rect = canvas.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    
    const gx = Math.floor(ex / CELL_SIZE);
    const gy = Math.floor(ey / CELL_SIZE);
    
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;
    if (gx === COLS - 1) { // Can't build on spawn column
        log("Cannot build in the horde spawn zone!", "error");
        return;
    }

    const currentCell = grid[gx][gy];
    
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
            log("Space already occupied!", "error");
            return;
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

startBtn.addEventListener('click', () => {
    if (phase === 'entrench') {
        phase = 'battle';
        phaseDisplay.innerText = "BATTLE!";
        phaseDisplay.className = "text-danger font-weight-bold";
        startBtn.style.display = 'none';
        log("THE HORDE IS COMING!", "wave");
        
        // Disable build buttons
        buildBtns.forEach(b => b.disabled = true);
        
        // Start loop
        requestAnimationFrame(gameLoop);
    }
});

restartBtn.addEventListener('click', () => location.reload());

// --- GAME LOGIC ---

function getFlowField() {
    // Distance from each cell to column 0
    let distances = [];
    for (let x = 0; x < COLS; x++) {
        distances[x] = [];
        for (let y = 0; y < ROWS; y++) {
            distances[x][y] = 9999;
        }
    }
    
    let queue = [];
    // Target is any cell in column 0
    for (let y = 0; y < ROWS; y++) {
        distances[0][y] = 0;
        queue.push({x: 0, y: y});
    }
    
    while(queue.length > 0) {
        let curr = queue.shift();
        
        let dirs = [[-1,0], [1,0], [0,-1], [0,1]];
        for(let d of dirs) {
            let nx = curr.x + d[0];
            let ny = curr.y + d[1];
            
            if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                // Check if blocked by solid defense (trench)
                let blocked = grid[nx][ny] && grid[nx][ny].type === 'trench';
                if (!blocked) {
                    let cost = grid[nx][ny] && grid[nx][ny].type === 'wire' ? 5 : 1; // wire is "expensive" path
                    if (distances[curr.x][curr.y] + cost < distances[nx][ny]) {
                        distances[nx][ny] = distances[curr.x][curr.y] + cost;
                        queue.push({x: nx, y: ny});
                    }
                }
            }
        }
    }
    return distances;
}

let flowField = null;

function spawnHorde() {
    let y = Math.floor(Math.random() * ROWS);
    horde.push({
        x: (COLS - 1) * CELL_SIZE + Math.random() * 20,
        y: y * CELL_SIZE + Math.random() * 20,
        hp: 30,
        speed: 1.5 + Math.random() * 1.5,
        targetCell: null,
        frame: 0
    });
    spawnedHorde++;
}

function update() {
    if (gameOver) return;
    ticks++;
    
    // Recalculate flow occasionally in case trenches break
    if (ticks % 30 === 0) flowField = getFlowField();
    
    if (spawnedHorde < maxHorde && ticks % 15 === 0) {
        spawnHorde();
    }
    
    // --- TOWERS (Maxims) ---
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = grid[x][y];
            if (cell && cell.type === 'maxim') {
                if (cell.cooldown > 0) cell.cooldown--;
                
                // Find targets in same row, to the right
                if (cell.cooldown <= 0) {
                    let targetFound = false;
                    for (let h of horde) {
                        let hx = Math.floor(h.x / CELL_SIZE);
                        let hy = Math.floor(h.y / CELL_SIZE);
                        if (hy === y && hx > x) {
                            targetFound = true;
                            break;
                        }
                    }
                    if (targetFound) {
                        // FIRE!
                        bullets.push({
                            x: x * CELL_SIZE + 30,
                            y: y * CELL_SIZE + 20,
                            vx: 15,
                            vy: 0,
                            pierceLeft: DEFENSES.maxim.pierce,
                            dmg: DEFENSES.maxim.dmg,
                            hitList: new Set() // Don't hit same dude twice in one frame
                        });
                        cell.cooldown = DEFENSES.maxim.fireRate;
                        createParticles(x * CELL_SIZE + 40, y * CELL_SIZE + 20, '#ffcc00', 3);
                    }
                }
            }
        }
    }
    
    // --- BULLETS ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        
        // Collision with horde
        for (let j = horde.length - 1; j >= 0; j--) {
            let h = horde[j];
            if (!b.hitList.has(h)) {
                let dx = b.x - (h.x + 10);
                let dy = b.y - (h.y + 10);
                if (dx*dx + dy*dy < 400) { // hit radius radius 20
                    h.hp -= b.dmg;
                    b.hitList.add(h);
                    b.pierceLeft--;
                    createParticles(h.x, h.y, 'red', 5);
                    if (h.hp <= 0) {
                        horde.splice(j, 1);
                        totalKills++;
                        if (totalKills % 10 === 0) log(`Kills: ${totalKills}`, 'kill');
                    }
                    if (b.pierceLeft <= 0) break;
                }
            }
        }
        
        if (b.pierceLeft <= 0 || b.x > CANVAS_W) {
            bullets.splice(i, 1);
        }
    }
    
    // --- HORDE MOVEMENT ---
    for (let i = horde.length - 1; i >= 0; i--) {
        let h = horde[i];
        h.frame++;
        
        // Base coordinate in grid
        let cx = Math.floor((h.x + 10) / CELL_SIZE);
        let cy = Math.floor((h.y + 10) / CELL_SIZE);
        
        if (cx <= 0) {
            // Reached the end!
            gameOver = true;
            log("THEY BROKE THROUGH! GAME OVER.", "error");
            restartBtn.style.display = 'block';
            return;
        }
        
        // Handle Cell Effects (Moat, Wire, Trench block)
        let inCell = grid[cx][cy];
        if (inCell) {
            if (inCell.type === 'moat') {
                if (inCell.capacity > 0) {
                    inCell.capacity--;
                    createParticles(h.x, h.y, 'brown', 10);
                    horde.splice(i, 1);
                    totalKills++;
                    if (inCell.capacity <= 0) {
                        grid[cx][cy] = null; // Moat is full! Keep moving over it
                        log(`Moat at [${cx},${cy}] is full!`, 'error');
                    }
                    continue;
                }
            }
        }
        
        // Determine speed
        let currentSpeed = h.speed;
        if (inCell && inCell.type === 'wire') {
            currentSpeed *= DEFENSES.wire.slow;
        }
        
        // Find best neighbor via Flow Field
        if (flowField) {
            let bestX = cx;
            let bestY = cy;
            let minD = flowField[cx][cy];
            
            let dirs = [[-1,0], [0,-1], [0,1], [1,0]];
            for(let d of dirs) {
                let nx = cx + d[0];
                let ny = cy + d[1];
                if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                    if (flowField[nx][ny] < minD) {
                        minD = flowField[nx][ny];
                        bestX = nx;
                        bestY = ny;
                    }
                }
            }
            
            // If completely trapped (distance 9999), attack nearest trench
            if (minD >= 9999) {
                // Try moving left anyway
                let nx = cx - 1;
                if (nx >= 0) {
                    let block = grid[nx][cy];
                    if (block && block.type === 'trench' && ticks % 10 === 0) {
                        block.hp -= 2;
                        createParticles(nx*CELL_SIZE+20, cy*CELL_SIZE+20, 'brown', 2);
                        if (block.hp <= 0) {
                            grid[nx][cy] = null;
                            log(`Trench destroyed at [${nx},${cy}]`, 'error');
                        }
                    }
                }
            } else {
                // Move towards bestX, bestY center
                let tx = bestX * CELL_SIZE + 10;
                let ty = bestY * CELL_SIZE + 10;
                
                let dx = tx - h.x;
                let dy = ty - h.y;
                let len = Math.sqrt(dx*dx + dy*dy);
                
                if (len > 1) {
                    h.x += (dx/len) * currentSpeed;
                    h.y += (dy/len) * currentSpeed;
                } else {
                    // Snap to grid slightly to avoid jitter
                    h.x = tx; h.y = ty;
                }
            }
        }
    }
    
    // Win condition
    if (spawnedHorde >= maxHorde && horde.length === 0) {
        gameOver = true;
        log("WAVE DEFEATED! HUMANITY SURVIVES... FOR NOW.", "wave");
        restartBtn.style.display = 'block';
    }
    
    // --- PARTICLES ---
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 10 + Math.random() * 10,
            color: color
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    
    // Draw Grid (Subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x*CELL_SIZE, 0); ctx.lineTo(x*CELL_SIZE, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y*CELL_SIZE); ctx.lineTo(CANVAS_W, y*CELL_SIZE); ctx.stroke();
    }
    
    // Draw Defenses
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = grid[x][y];
            if (cell) {
                let px = x * CELL_SIZE;
                let py = y * CELL_SIZE;
                
                // Base structure
                ctx.fillStyle = DEFENSES[cell.type].color;
                ctx.fillRect(px+2, py+2, CELL_SIZE-4, CELL_SIZE-4);
                
                // Hover effect logic
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(DEFENSES[cell.type].symbol, px + CELL_SIZE/2, py + CELL_SIZE/2);
                
                if (cell.type === 'moat') {
                    // capacity indicator
                    ctx.fillStyle = 'rgba(255,0,0,0.5)';
                    ctx.fillRect(px, py + CELL_SIZE - 5, (cell.capacity / DEFENSES[cell.type].capacity) * CELL_SIZE, 5);
                } else if (cell.type === 'trench') {
                    // HP indicator
                    ctx.fillStyle = 'rgba(0,255,0,0.5)';
                    ctx.fillRect(px, py + CELL_SIZE - 5, (cell.hp / 100) * CELL_SIZE, 5);
                }
            }
        }
    }
    
    // Draw Spawn area danger zone
    ctx.fillStyle = 'rgba(255,0,0,0.1)';
    ctx.fillRect((COLS-1)*CELL_SIZE, 0, CELL_SIZE, CANVAS_H);
    
    if (phase === 'entrench') {
        // Draw hover preview? Optional, skipping for now
    } else {
        // Draw Horde
        for (let h of horde) {
            // Draw angry face
            ctx.fillStyle = '#ffcc99'; // Skin tone
            ctx.beginPath();
            ctx.arc(h.x + 10, h.y + 10, 10, 0, Math.PI*2);
            ctx.fill();
            
            // Angry pixel eyes
            ctx.fillStyle = 'black';
            ctx.fillRect(h.x + 5, h.y + 5, 3, 3);
            ctx.fillRect(h.x + 12, h.y + 5, 3, 3);
            
            // Angry mouth
            ctx.strokeStyle = 'black';
            ctx.beginPath();
            ctx.moveTo(h.x + 5, h.y + 12);
            ctx.lineTo(h.x + 10, h.y + 10);
            ctx.lineTo(h.x + 15, h.y + 12);
            ctx.stroke();
            
            // Wiggle weapon
            ctx.strokeStyle = '#aaaaaa';
            let swing = Math.sin(h.frame * 0.2) * 5;
            ctx.beginPath();
            ctx.moveTo(h.x, h.y + 10);
            ctx.lineTo(h.x - 10 + swing, h.y + 10 + swing);
            ctx.stroke();
            
            // HP Bar
            ctx.fillStyle = 'red';
            ctx.fillRect(h.x, h.y - 5, 20 * (h.hp/30), 3);
        }
        
        // Draw Bullets
        ctx.fillStyle = 'yellow';
        for (let b of bullets) {
            ctx.fillRect(b.x, b.y - 1, 10, 3);
        }
        
        // Draw Particles
        for (let p of particles) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
        }
    }
}

function gameLoop() {
    update();
    draw();
    if (!gameOver) {
        requestAnimationFrame(gameLoop);
    }
}

// Initial draw
draw();
