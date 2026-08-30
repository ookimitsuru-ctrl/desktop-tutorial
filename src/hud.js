export class HUD {
  constructor() {
    this.hpPlayer = document.getElementById("hp-player");
    this.hpEnemy = document.getElementById("hp-enemy");
    this.boostFill = document.getElementById("boost-fill");
    this.ammoCount = document.getElementById("ammo-count");
    this.timerEl = document.getElementById("timer");
    this.roundLabel = document.getElementById("round-label");
    this.messageBanner = document.getElementById("message-banner");
    this.reticle = document.getElementById("lock-reticle");
    this.radarEnemyDot = document.getElementById("radar-enemy-dot");
    this.resultScreen = document.getElementById("result-screen");
    this.resultTitle = document.getElementById("result-title");
    this.startScreen = document.getElementById("start-screen");
  }

  update({ player, enemy, timer, camera }) {
    this.hpPlayer.style.width = `${Math.max(0, player.hp)}%`;
    this.hpEnemy.style.width = `${Math.max(0, enemy.hp)}%`;
    this.hpPlayer.classList.toggle("low", player.hp < 30);
    this.hpEnemy.classList.toggle("low", enemy.hp < 30);

    this.boostFill.style.width = `${Math.max(0, player.boost)}%`;
    this.boostFill.classList.toggle("empty", player.boost < 20);
    this.ammoCount.textContent = player.missileAmmo;

    this.timerEl.textContent = Math.max(0, Math.ceil(timer));

    // radar: relative position of enemy around player, ROTATED to match the
    // player's current facing (same convention as movement/camera: "forward"
    // points up, "screen-right" points right) so it agrees with what's on
    // screen instead of showing a fixed world-north-up map.
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    const facing = player.facing;
    const forwardX = Math.sin(facing), forwardZ = Math.cos(facing);
    const rightX = -forwardZ, rightZ = forwardX;
    const radarRight = dx * rightX + dz * rightZ;
    const radarForward = dx * forwardX + dz * forwardZ;
    const scale = 3.2; // world units per radar px
    const rx = Math.max(-38, Math.min(38, (radarRight / scale) * 10));
    const ry = Math.max(-38, Math.min(38, (-radarForward / scale) * 10));
    this.radarEnemyDot.style.transform = `translate(calc(-50% + ${rx}px), calc(-50% + ${ry}px))`;

    // lock reticle screen position (project enemy world pos)
    const vec = enemy.position.clone();
    vec.y += 1.6;
    vec.project(camera);
    const visible = vec.z < 1;
    if (visible) {
      const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;
      this.reticle.style.left = `${x}px`;
      this.reticle.style.top = `${y}px`;
      this.reticle.style.display = "block";
    } else {
      this.reticle.style.display = "none";
    }
  }

  flashMessage(text) {
    this.messageBanner.textContent = text;
    this.messageBanner.classList.remove("show");
    // force reflow to restart animation
    void this.messageBanner.offsetWidth;
    this.messageBanner.classList.add("show");
  }

  showResult(win) {
    this.resultScreen.classList.remove("hidden");
    this.resultTitle.textContent = win ? "WIN" : "LOSE";
    this.resultTitle.className = win ? "win" : "lose";
  }

  hideResult() {
    this.resultScreen.classList.add("hidden");
  }

  hideStart() {
    this.startScreen.classList.add("hidden");
  }
  showStart() {
    this.startScreen.classList.remove("hidden");
  }
}
