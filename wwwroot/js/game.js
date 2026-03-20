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
    maxim: { cost: 200, color: '#2F4F4F', symbol: '🔫', hp: 50, fireRate: 10, range: 800, pierce: 4, dmg: 10 },
    moat: { cost: 150, color: '#1a3b3a', symbol: '🐊', capacity: 5 },
    oil:  { cost: 60, color: '#111111', symbol: '🛢️', hp: 50 },
    bridge: { cost: 100, color: '#D2691E', symbol: '🌉', hp: 100 }
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
let ticks = 0;
let totalKills = 0;
let maxHorde = 40; // Smaller horde as requested
let spawnedHorde = 0;
let gameOver = false;
let victory = false;

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const suppliesDisplay = document.getElementById('suppliesDisplay');
const phaseDisplay = document.getElementById('phaseDisplay');
const logDiv = document.getElementById('battleLog');
const buildBtns = document.querySelectorAll('.build-btn');
const startBtn = document.getElementById('startWaveBtn');
const restartBtn = document.getElementById('restartBtn');

// Initialize Grid & Terrain
function initMap() {
    for (let x = 0; x < COLS; x++) {
        grid[x] = [];
        terrain[x] = [];
        for (let y = 0; y < ROWS; y++) {
            grid[x][y] = null;
            terrain[x][y] = 0; // Grass by default
        }
    }
    
    // Castle Keep in center (2x2)
    terrain[9][4] = 3;
    terrain[10][4] = 3;
    terrain[9][5] = 3;
    terrain[10][5] = 3;

    // Generate Natural Obstacles (avoiding center and spawns)
    let obstacleCount = 20; // Try to place 20 obstacles
    for(let i=0; i<obstacleCount; i++) {
        let ox = Math.floor(Math.random()*(COLS - 2)) + 1; // avoid extreme edges
        let oy = Math.floor(Math.random()*(ROWS - 2)) + 1;
        
        // Don't place on castle or immediate surrounding
        if (ox >= 8 && ox <= 11 && oy >= 3 && oy <= 6) continue;
        
        // 50% rock, 50% water pond
        terrain[ox][oy] = Math.random() > 0.5 ? 1 : 2;
        
        // Clump them slightly
        if (Math.random() > 0.5) {
            let dx = ox + (Math.random() > 0.5 ? 1 : -1);
            let dy = oy + (Math.random() > 0.5 ? 1 : -1);
            if (dx > 0 && dx < COLS-1 && dy > 0 && dy < ROWS-1) {
                if (!(dx >= 8 && dx <= 11 && dy >= 3 && dy <= 6)) {
                    terrain[dx][dy] = terrain[ox][oy];
                }
            }
        }
    }
}
initMap();

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
    
    // Edge spawn area restriction
    if (gx === 0 || gx === COLS-1 || gy === 0 || gy === ROWS-1) {
        log("Cannot build in the horde spawn zones (outer edges)!", "error");
        return;
    }

    const currentCell = grid[gx][gy];
    const cellTerrain = terrain[gx][gy];
    
    if (cellTerrain === 3) {
        log("Cannot build on the Castle Keep!", "error");
        return;
    }
    if (cellTerrain === 2) {
        log("Cannot build on solid rock!", "error");
        return;
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
            log("Space already occupied!", "error");
            return;
        }
        
        if (isWater && selectedTool !== 'bridge') {
            log("You can only build a Bridge on water ponds!", "error");
            return;
        }
        if (!isWater && selectedTool === 'bridge') {
            log("Bridges must go over water!", "error");
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
        phaseDisplay.innerText = "DEFEND THE CASTLE!";
        phaseDisplay.className = "text-danger font-weight-bold";
        startBtn.style.display = 'none';
        log("THE HORDE IS APPROACHING FROM ALL SIDES!", "wave");
        buildBtns.forEach(b => b.disabled = true);
        requestAnimationFrame(gameLoop);
    }
});

restartBtn.addEventListener('click', () => location.reload());

// --- GAME LOGIC ---

function getFlowField() {
    let distances = [];
    for (let x = 0; x < COLS; x++) {
        distances[x] = [];
        for (let y = 0; y < ROWS; y++) {
            distances[x][y] = 9999;
        }
    }
    
    let queue = [];
    // Target is the Castle Keep
    distances[9][4] = 0; distances[10][4] = 0;
    distances[9][5] = 0; distances[10][5] = 0;
    queue.push({x:9, y:4}, {x:10, y:4}, {x:9, y:5}, {x:10, y:5});
    
    while(queue.length > 0) {
        let curr = queue.shift();
        
        let dirs = [[-1,0], [1,0], [0,-1], [0,1], [-1,-1], [-1,1], [1,-1], [1,1]];
        for(let d of dirs) {
            let nx = curr.x + d[0];
            let ny = curr.y + d[1];
            
            if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                let cellTerrain = terrain[nx][ny];
                let cellDef = grid[nx][ny];
                
                let blocked = cellDef && (cellDef.type === 'trench' || cellDef.type === 'moat');
                if (cellTerrain === 2) blocked = true; // Rock is solid
                if (cellTerrain === 1 && (!cellDef || cellDef.type !== 'bridge')) blocked = true; // Water
                
                if (!blocked) {
                    let cost = cellDef && cellDef.type === 'wire' ? 5 : 1; 
                    if (d[0] !== 0 && d[1] !== 0) cost *= 1.4; // diagonal penalty
                    
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
    let side = Math.floor(Math.random() * 4); // 0:Top, 1:Right, 2:Bottom, 3:Left
    let sx, sy;
    if (side === 0) { sx = Math.random()*CANVAS_W; sy = -10; }
    else if (side === 1) { sx = CANVAS_W + 10; sy = Math.random()*CANVAS_H; }
    else if (side === 2) { sx = Math.random()*CANVAS_W; sy = CANVAS_H + 10; }
    else { sx = -10; sy = Math.random()*CANVAS_H; }
    
    horde.push({
        x: sx,
        y: sy,
        hp: 30,
        speed: 1.0 + Math.random() * 1.5,
        slipTime: 0,
        slipDirX: 0,
        slipDirY: 0,
        spin: 0,
        frame: 0,
        // Add random wiggle offsets to avoid straight lines
        wigglePhase: Math.random() * Math.PI * 2
    });
    spawnedHorde++;
}

// Keep explosion animation
let castleExplosion = 0;

function explodeCastle() {
    if (castleExplosion === 0) {
        log("THE KEEP HAS FALLEN! BOOM!", "error");
        castleExplosion = 1;
        // spawn massive particles
        for(let i=0; i<300; i++) {
            particles.push({
                x: 10 * CELL_SIZE, y: 5 * CELL_SIZE,
                vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
                life: 30 + Math.random() * 50,
                color: Math.random() > 0.5 ? 'red' : 'orange'
            });
        }
    }
}

function update() {
    if (gameOver) {
        if (castleExplosion > 0) castleExplosion++;
        updateParticles();
        return;
    }
    
    ticks++;
    if (ticks % 30 === 0) flowField = getFlowField();
    
    if (spawnedHorde < maxHorde && ticks % 20 === 0) {
        spawnHorde();
    }
    
    // --- TOWERS (Maxims) ---
    // Maxims now fire at nearest target within range, 360 degrees
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
                        let dx = h.x + 10 - mx;
                        let dy = h.y + 10 - my;
                        let distSq = dx*dx + Math.abs(dy)*Math.abs(dy); // Use squished distance or real distance
                        if (distSq < DEFENSES.maxim.range*DEFENSES.maxim.range && distSq < bestDest) {
                            bestDest = distSq;
                            target = h;
                        }
                    }
                    if (target) {
                        let dx = target.x + 10 - mx;
                        let dy = target.y + 10 - my;
                        let angle = Math.atan2(dy, dx);
                        
                        // Inaccuracy spray!
                        angle += (Math.random() - 0.5) * 0.4;
                        
                        bullets.push({
                            x: mx, y: my,
                            vx: Math.cos(angle) * 18,
                            vy: Math.sin(angle) * 18,
                            pierceLeft: DEFENSES.maxim.pierce,
                            dmg: DEFENSES.maxim.dmg,
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
        b.x += b.vx;
        b.y += b.vy;
        
        for (let j = horde.length - 1; j >= 0; j--) {
            let h = horde[j];
            if (!b.hitList.has(h)) {
                let dx = b.x - (h.x + 10);
                let dy = b.y - (h.y + 10);
                if (dx*dx + dy*dy < 400) { 
                    h.hp -= b.dmg;
                    b.hitList.add(h);
                    b.pierceLeft--;
                    createParticles(h.x, h.y, 'red', 4);
                    if (h.hp <= 0) {
                        horde.splice(j, 1);
                        totalKills++;
                        if (totalKills % 10 === 0) log(`Kills: ${totalKills}`, 'kill');
                    }
                    if (b.pierceLeft <= 0) break;
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
        
        // Handle Map Bounds
        if (cx < 0) cx = 0; if (cx >= COLS) cx = COLS - 1;
        if (cy < 0) cy = 0; if (cy >= ROWS) cy = ROWS - 1;
        
        let inCell = grid[cx][cy];
        let cellTerrain = terrain[cx][cy];
        
        // Castle Attack!
        if (cellTerrain === 3) {
            explodeCastle();
            gameOver = true;
            restartBtn.style.display = 'block';
            return;
        }
        
        // Drowning Death (Water pond + Slipping into it!)
        if (cellTerrain === 1 && (!inCell || inCell.type !== 'bridge')) {
            createParticles(h.x, h.y, '#1e90ff', 20); // splash
            horde.splice(i, 1);
            log("A horde member drowned in a pond!", 'error');
            continue;
        }
        
        // Moat Death
        if (inCell && inCell.type === 'moat') {
            if (inCell.capacity > 0) {
                inCell.capacity--;
                createParticles(h.x, h.y, 'green', 15);
                createParticles(h.x, h.y, 'red', 5);
                horde.splice(i, 1);
                if (inCell.capacity <= 0) {
                    grid[cx][cy] = null; 
                    log(`Croc Moat at [${cx},${cy}] is full and collapsed!`, 'error');
                }
                continue;
            }
        }
        
        // Oil Slick - starts slipping
        if (inCell && inCell.type === 'oil') {
            if (h.slipTime <= 0) {
                h.slipTime = 40; 
                let angle = Math.random() * Math.PI * 2;
                h.slipDirX = Math.cos(angle);
                h.slipDirY = Math.sin(angle);
            }
        }
        
        let currentSpeed = h.speed;
        if (inCell && inCell.type === 'wire') currentSpeed *= DEFENSES.wire.slow;
        
        // Wiggle movement for natural squiggly lines
        let wiggleX = Math.cos(h.frame * 0.1 + h.wigglePhase) * 0.5;
        let wiggleY = Math.sin(h.frame * 0.1 + h.wigglePhase) * 0.5;
        
        if (h.slipTime > 0) {
            h.slipTime--;
            h.spin += 0.3; 
            h.x += h.slipDirX * 4; 
            h.y += h.slipDirY * 4;
            continue; 
        } else {
            h.spin = 0; 
        }
        
        if (flowField) {
            let bestX = cx;
            let bestY = cy;
            let minD = flowField[cx][cy] !== undefined ? flowField[cx][cy] : 9999;
            
            let dirs = [[-1,0], [0,-1], [0,1], [1,0], [-1,-1], [-1,1], [1,-1], [1,1]];
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
            
            if (minD >= 9999 && h.frame > 30) {
                // Trapped! Attack nearest block
                // Only attack adjacent blockers
                let hitObstacle = false;
                for(let d of [[-1,0],[1,0],[0,-1],[0,1]]) {
                    let nx = cx+d[0]; let ny=cy+d[1];
                    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                         let block = grid[nx][ny];
                         if (block && (block.type === 'trench' || block.type === 'oil' || block.type === 'maxim')) {
                             if (ticks % 10 === 0) {
                                 block.hp -= 2;
                                 createParticles(nx*CELL_SIZE+20, ny*CELL_SIZE+20, 'brown', 2);
                                 if (block.hp <= 0) grid[nx][ny] = null;
                             }
                             hitObstacle = true;
                             break;
                         }
                    }
                }
                // If it can't find something adjacent, try shuffling
                if (!hitObstacle) {
                    h.x += (Math.random()-0.5)*2;
                    h.y += (Math.random()-0.5)*2;
                }
            } else {
                let tx = bestX * CELL_SIZE + 20;
                let ty = bestY * CELL_SIZE + 20;
                
                let dx = tx - (h.x + 10);
                let dy = ty - (h.y + 10);
                let len = Math.sqrt(dx*dx + dy*dy);
                
                if (len > 1) {
                    h.x += (dx/len) * currentSpeed + wiggleX;
                    h.y += (dy/len) * currentSpeed + wiggleY;
                }
            }
        }
    }
    
    if (spawnedHorde >= maxHorde && horde.length === 0) {
        gameOver = true;
        victory = true;
        log("WAVE DEFEATED! THE CASTLE STANDS!", "wave");
        restartBtn.style.display = 'block';
    }
    
    updateParticles();
}

function updateParticles() {
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
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 10 + Math.random() * 15,
            color: color
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    
    // Draw Base Terrain
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let t = terrain[x][y];
            let px = x * CELL_SIZE;
            let py = y * CELL_SIZE;
            
            if (t === 0) {
                // Grass
                ctx.fillStyle = '#4c6344'; // Base grass
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                // Add natural tufts to terrain
                if ((x+y)%2===0) {
                     ctx.fillStyle = '#566e4d';
                     ctx.fillRect(px+10, py+10, 20, 20);
                }
            } else if (t === 1) {
                // Pond shape
                ctx.fillStyle = '#4c6344'; // Base grass underneath
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                
                // Draw irregular blob
                ctx.fillStyle = '#3a8ebf';
                ctx.beginPath();
                ctx.ellipse(px + 20, py + 20, 15, 12 + Math.abs(px%10), Math.PI/4, 0, Math.PI*2);
                ctx.fill();
            } else if (t === 2) {
                // Rock chunk
                ctx.fillStyle = '#4c6344'; // Base grass underneath
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                
                ctx.fillStyle = '#666666';
                ctx.beginPath();
                ctx.moveTo(px+10, py+30);
                ctx.lineTo(px+20, py+5);
                ctx.lineTo(px+35, py+25);
                ctx.lineTo(px+25, py+35);
                ctx.fill();
                // Rock highlight
                ctx.fillStyle = '#888888';
                ctx.beginPath();
                ctx.moveTo(px+12, py+28);
                ctx.lineTo(px+20, py+8);
                ctx.lineTo(px+25, py+26);
                ctx.fill();
            } else if (t === 3) {
                // Castle Base
                ctx.fillStyle = '#777';
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                // Brick lines
                ctx.strokeStyle = '#555';
                ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.strokeRect(px+5, py+5, CELL_SIZE-10, CELL_SIZE-10);
            }
        }
    }
    
    // Draw Castle Details (Spans 9-10, 4-5)
    if (!castleExplosion) {
        ctx.fillStyle = '#444';
        ctx.fillRect(9*CELL_SIZE + 10, 4*CELL_SIZE + 10, 2*CELL_SIZE - 20, 2*CELL_SIZE - 20);
        ctx.fillStyle = 'black';
        ctx.fillRect(9*CELL_SIZE + 30, 5*CELL_SIZE - 10, 20, 20); // Keep door
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
                
                ctx.fillStyle = DEFENSES[cell.type].color;
                ctx.fillRect(px+2, py+2, CELL_SIZE-4, CELL_SIZE-4);
                
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(DEFENSES[cell.type].symbol, px + CELL_SIZE/2, py + CELL_SIZE/2);
                
                if (cell.type === 'moat') {
                    ctx.fillStyle = 'rgba(255,0,0,0.5)';
                    ctx.fillRect(px, py + CELL_SIZE - 5, (cell.capacity / DEFENSES[cell.type].capacity) * CELL_SIZE, 5);
                } else if (cell.type === 'trench' || cell.type === 'oil' || cell.type === 'maxim') {
                    ctx.fillStyle = 'rgba(0,255,0,0.5)';
                    ctx.fillRect(px, py + CELL_SIZE - 5, (cell.hp / DEFENSES[cell.type].hp) * CELL_SIZE, 5);
                }
            }
        }
    }
    
    if (phase === 'battle') {
        // Draw Horde
        for (let h of horde) {
            ctx.save();
            ctx.translate(h.x + 10, h.y + 10);
            
            if (h.spin !== 0) ctx.rotate(h.spin);
            
            ctx.fillStyle = '#ffcc99'; 
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI*2); // slightly smaller
            ctx.fill();
            
            // Angry pixel eyes
            ctx.fillStyle = 'black';
            ctx.fillRect(-4, -4, 2, 2);
            ctx.fillRect(2, -4, 2, 2);
            
            // Mouth
            ctx.strokeStyle = h.spin ? 'red' : 'black';
            ctx.beginPath();
            if (h.spin) {
                ctx.arc(0, 4, 3, 0, Math.PI*2); 
                ctx.stroke();
            } else {
                ctx.moveTo(-4, 2);
                ctx.lineTo(0, 0);
                ctx.lineTo(4, 2);
                ctx.stroke();
            }
            
            ctx.restore();
            
            // HP Bar
            ctx.fillStyle = 'red';
            ctx.fillRect(h.x, h.y - 4, 20 * (h.hp/30), 2);
        }
        
        // Draw Bullets
        ctx.fillStyle = 'yellow';
        for (let b of bullets) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(Math.atan2(b.vy, b.vx));
            ctx.fillRect(-5, -1, 10, 3);
            ctx.restore();
        }
        
    }
    
    // Draw Particles regardless of phase
    for (let p of particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    }

    if (castleExplosion > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${0.8 - (castleExplosion/100)})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Courier New';
        ctx.fillText("THE KEEP FELL!", CANVAS_W/2, CANVAS_H/2);
    }
    
    if (victory) {
        ctx.fillStyle = `rgba(0, 255, 0, 0.4)`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Courier New';
        ctx.fillText("VICTORY!", CANVAS_W/2, CANVAS_H/2);
    }
}

function gameLoop() {
    update();
    draw();
    if (!gameOver || castleExplosion > 0 && castleExplosion < 100) {
        requestAnimationFrame(gameLoop);
    }
}

draw();
