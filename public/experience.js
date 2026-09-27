(() => {
  'use strict';

  function startExperience() {
    const chatView = document.getElementById('chat-view');
    const welcome = document.getElementById('welcome');
    const send = document.getElementById('send');
    const newChat = document.getElementById('new-chat');
    const question = document.getElementById('question');
    if (!chatView || !welcome || !send || !newChat || !question) return;

    const main = chatView.querySelector('.chat-main');
    const waitingVisual = document.getElementById('waiting-visual');
    const canvas = document.getElementById('waiting-orb');
    const context = canvas && canvas.getContext('2d');
    const pauseButton = document.getElementById('pause-motion');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointCount = 450;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const points = Array.from({ length: pointCount }, (_, index) => {
      const y = 1 - ((index + 0.5) / pointCount) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = goldenAngle * index;
      return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, index };
    });
    let width = 0;
    let height = 0;
    let pending = false;
    let userPaused = false;
    let animationFrame = 0;
    let previousTime = 0;
    let phase = 0;
    let sizeFrame = 0;
    let revealFrame = 0;
    let exitTimer = 0;
    const background = [document.querySelector('.site-header'), document.querySelector('.site-footer'), chatView.querySelector('.workspace-bar'), document.getElementById('messages'), chatView.querySelector('.composer-wrap'), document.getElementById('not-ready')].filter(Boolean);

    function restoreContent() {
      document.body.classList.remove('network-active');
      background.forEach(element => { element.inert = false; });
      if (waitingVisual) waitingVisual.hidden = true;
      if (!chatView.hidden && welcome.hidden) {
        const answer = chatView.querySelector('.message.assistant:last-of-type');
        if (answer) {
          answer.tabIndex = -1;
          answer.focus({ preventScroll: true });
          answer.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
        } else question.focus({ preventScroll: true });
      }
    }

    function showWaiting(active) {
      clearTimeout(exitTimer);
      cancelAnimationFrame(revealFrame);
      if (active && waitingVisual) {
        waitingVisual.hidden = false;
        document.body.classList.add('network-active');
        background.forEach(element => { element.inert = true; });
        revealFrame = requestAnimationFrame(() => waitingVisual.classList.add('is-visible'));
      } else {
        if (waitingVisual) waitingVisual.classList.remove('is-visible');
        if (chatView.hidden || reducedMotion.matches) restoreContent();
        else exitTimer = setTimeout(restoreContent, 280);
      }
    }

    function fitQuestion() {
      if (!question.getClientRects().length) return;
      const style = window.getComputedStyle(question);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      question.style.height = 'auto';
      const naturalHeight = question.scrollHeight + borders;
      const visibleHeight = Math.min(150, naturalHeight);
      question.style.height = `${Math.max(1, visibleHeight - (style.boxSizing === 'border-box' ? 0 : padding + borders))}px`;
      question.style.overflowY = naturalHeight > 150 ? 'auto' : 'hidden';
    }

    function scheduleQuestionFit() {
      if (sizeFrame) return;
      sizeFrame = window.requestAnimationFrame(() => {
        sizeFrame = 0;
        fitQuestion();
      });
    }

    function fitCanvas() {
      if (!context || !canvas) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(width * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function drawSphere() {
      if (!context || !width || !height) return;
      if (!pending) return;
      context.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) * 0.365;
      const cosine = Math.cos(phase);
      const sine = Math.sin(phase);
      const tilt = 0.2 + Math.sin(phase * 0.4) * 0.08;
      const tiltCosine = Math.cos(tilt);
      const tiltSine = Math.sin(tilt);
      const projected = points.map(point => {
        const x = point.x * cosine + point.z * sine;
        const z = -point.x * sine + point.z * cosine;
        const y = point.y * tiltCosine - z * tiltSine;
        const depth = point.y * tiltSine + z * tiltCosine;
        const perspective = 3.6 / (3.6 - depth);
        return { x: width / 2 + x * radius * perspective, y: height / 2 + y * radius * perspective, depth, perspective, index: point.index };
      }).sort((a, b) => a.depth - b.depth);

      for (const point of projected) {
        const front = (point.depth + 1) / 2;
        const alpha = 0.16 + front * 0.74;
        const accent = (point.index % 19) < 4;
        const hue = accent ? 75 + Math.sin(phase + point.index) * 7 : 170 + Math.sin(phase * 0.8 + point.index * 0.3) * 8;
        context.fillStyle = `hsla(${hue}, ${accent ? 61 : 53}%, ${accent ? 51 : 29}%, ${alpha})`;
        context.beginPath();
        context.arc(point.x, point.y, (0.75 + front * 0.7) * point.perspective, 0, Math.PI * 2);
        context.fill();
      }
    }

    function canAnimate() {
      return Boolean(context && pending && !chatView.hidden && !document.hidden && !userPaused && !reducedMotion.matches);
    }

    function tick(time) {
      animationFrame = 0;
      if (!canAnimate()) {
        previousTime = 0;
        return;
      }
      if (previousTime) phase += Math.min(time - previousTime, 80) * 0.00017;
      previousTime = time;
      drawSphere();
      animationFrame = window.requestAnimationFrame(tick);
    }

    function updateAnimation() {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      previousTime = 0;
      if (pauseButton) {
        pauseButton.textContent = userPaused ? 'Reprendre l’animation' : 'Pause animation';
        pauseButton.setAttribute('aria-pressed', String(userPaused));
        pauseButton.setAttribute('aria-label', userPaused ? 'Reprendre l’animation' : 'Mettre l’animation en pause');
        pauseButton.disabled = reducedMotion.matches;
      }
      if (document.hidden) return;
      fitCanvas();
      drawSphere();
      if (canAnimate()) animationFrame = window.requestAnimationFrame(tick);
    }

    function syncPresentation() {
      // Both controls are disabled only while app.js owns a pending request.
      // A disabled Send button on its own means Dust has not been configured.
      const wasPending = pending;
      pending = !chatView.hidden && send.disabled && newChat.disabled;
      chatView.classList.toggle('is-waiting', pending);
      if (pending !== wasPending) showWaiting(pending);
      else if (chatView.hidden) restoreContent();
      if (main) main.classList.toggle('has-conversation', !chatView.hidden && welcome.hidden);
      updateAnimation();
      scheduleQuestionFit();
    }

    const stateObserver = new MutationObserver(syncPresentation);
    stateObserver.observe(chatView, { attributes: true, attributeFilter: ['hidden'] });
    stateObserver.observe(welcome, { attributes: true, attributeFilter: ['hidden'] });
    stateObserver.observe(send, { attributes: true, attributeFilter: ['disabled'] });
    stateObserver.observe(newChat, { attributes: true, attributeFilter: ['disabled'] });

    question.addEventListener('input', scheduleQuestionFit);
    // The existing app fills suggestions and clears submitted text in code.
    // Resize after those events without changing or intercepting submission.
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[data-prompt], #new-chat, #logout')) scheduleQuestionFit();
    });
    const form = document.getElementById('chat-form');
    if (form) {
      form.addEventListener('submit', scheduleQuestionFit);
      form.addEventListener('reset', scheduleQuestionFit);
    }

    if (pauseButton) pauseButton.addEventListener('click', () => {
      userPaused = !userPaused;
      updateAnimation();
    });
    document.addEventListener('visibilitychange', updateAnimation);
    reducedMotion.addEventListener('change', updateAnimation);
    window.addEventListener('resize', () => {
      updateAnimation();
      scheduleQuestionFit();
    });
    if (canvas && typeof ResizeObserver !== 'undefined') {
      const canvasObserver = new ResizeObserver(() => {
        fitCanvas();
        if (!document.hidden) drawSphere();
      });
      canvasObserver.observe(canvas);
    }
    syncPresentation();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startExperience, { once: true });
  else startExperience();
})();
