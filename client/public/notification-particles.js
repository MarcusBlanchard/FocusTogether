/**
 * Vanilla particle layer for Tauri notification windows (no ES modules — loads reliably from asset://).
 * Configure via window.__NOTIFICATION_PARTICLES__ before this script runs.
 */
(function () {
  function readConfig() {
    var c = window.__NOTIFICATION_PARTICLES__ || {};
    return {
      color: c.color || "#ffffff",
      particleCount: Math.max(
        10,
        Math.min(500, c.particleCount != null ? c.particleCount : 44),
      ),
      animationSpeed:
        c.animationSpeed != null ? c.animationSpeed : 1,
      alpha: c.alpha != null ? c.alpha : 0.38,
    };
  }

  function initParticle(width, height) {
    var baseSize = 4 + Math.random() * 6;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      size: baseSize,
      baseSize: baseSize,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.6,
      vx: (0.2 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1),
      vy: (0.1 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1),
      angle: Math.random() * Math.PI * 2,
    };
  }

  function initParticles(width, height, count) {
    var particles = [];
    for (var i = 0; i < count; i++) particles.push(initParticle(width, height));
    return particles;
  }

  function drawDiamond(ctx, x, y, size, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.6, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function startNotificationParticles(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return {
        setColor: function () {},
        setAnimationSpeed: function () {},
        stop: function () {},
      };
    }

    var settings = readConfig();
    var particles = [];
    var sizeRef = { width: 0, height: 0 };
    var animationId = 0;

    function resize() {
      var parent = canvas.parentElement;
      var w = parent ? parent.clientWidth : window.innerWidth;
      var h = parent ? parent.clientHeight : window.innerHeight;
      var width = Math.max(1, w);
      var height = Math.max(1, h);
      canvas.width = width;
      canvas.height = height;
      sizeRef.width = width;
      sizeRef.height = height;
      particles = initParticles(width, height, settings.particleCount);
    }

    resize();
    window.addEventListener("resize", resize);
    if (window.ResizeObserver && canvas.parentElement) {
      var ro = new ResizeObserver(function () {
        resize();
      });
      ro.observe(canvas.parentElement);
    }

    function animate(time) {
      var width = sizeRef.width;
      var height = sizeRef.height;
      var color = settings.color;
      var speedMult = settings.animationSpeed;
      var alpha = settings.alpha;
      var elapsed = time * 0.001 * speedMult;

      ctx.clearRect(0, 0, width, height);

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * speedMult;
        p.y += p.vy * speedMult;
        p.size =
          p.baseSize * (0.8 + 0.2 * Math.sin(elapsed * p.speed + p.phase));

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        drawDiamond(ctx, p.x, p.y, p.size, p.angle);
        ctx.restore();
      }

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return {
      setColor: function (color, alphaOverride) {
        settings.color = color;
        if (alphaOverride !== undefined) settings.alpha = alphaOverride;
      },
      setAnimationSpeed: function (n) {
        settings.animationSpeed = n;
      },
      stop: function () {
        window.removeEventListener("resize", resize);
        cancelAnimationFrame(animationId);
      },
    };
  }

  function boot() {
    var canvas = document.getElementById("particle-canvas");
    if (!canvas || canvas.tagName !== "CANVAS") return;
    window.__notificationParticles = startNotificationParticles(canvas);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
