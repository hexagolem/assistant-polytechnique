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
    const runnerGame = document.getElementById('runner-game');
    const runnerCanvas = document.getElementById('runner-canvas');
    const runnerContext = runnerCanvas && runnerCanvas.getContext('2d');
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
    let runnerWidth = 0;
    let runnerHeight = 0;
    let runnerGround = 0;
    let runnerScore = 0;
    let runnerDistance = 0;
    let runnerSpeed = 0.19;
    let nextObstacle = 0;
    let runnerDeadUntil = 0;
    const runner = { x: 36, y: 0, width: 27, height: 31, velocity: 0, grounded: true };
    const obstacles = [];
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
        resetRunner();
        document.body.classList.add('network-active');
        background.forEach(element => { element.inert = true; });
        revealFrame = requestAnimationFrame(() => {
          waitingVisual.classList.add('is-visible');
          runnerGame?.focus({preventScroll:true});
        });
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

    function fitRunnerCanvas() {
      if (!runnerContext || !runnerCanvas) return;
      const bounds = runnerCanvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      runnerWidth = bounds.width;
      runnerHeight = bounds.height;
      runnerGround = runnerHeight - 17;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(runnerWidth * ratio));
      const pixelHeight = Math.max(1, Math.round(runnerHeight * ratio));
      if (runnerCanvas.width !== pixelWidth || runnerCanvas.height !== pixelHeight) {
        runnerCanvas.width = pixelWidth;
        runnerCanvas.height = pixelHeight;
      }
      runnerContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (runner.grounded) runner.y = runnerGround - runner.height;
    }

    function resetRunner() {
      fitRunnerCanvas();
      runnerScore = 0;
      runnerDistance = 0;
      runnerSpeed = 0.19;
      nextObstacle = 780;
      runnerDeadUntil = 0;
      obstacles.length = 0;
      runner.velocity = 0;
      runner.grounded = true;
      runner.y = runnerGround - runner.height;
      drawRunner();
    }

    function jumpRunner() {
      if (!pending || runnerDeadUntil || reducedMotion.matches) return;
      if (runner.grounded) {
        runner.velocity = -0.57;
        runner.grounded = false;
      }
    }

    function drawPixelDino(x, y) {
      if (!runnerContext) return;
      const ctx = runnerContext;
      const unit = 3;
      ctx.fillStyle = '#284d3d';
      const blocks = [
        [3,0,5,1],[2,1,7,1],[2,2,5,1],[2,3,7,1],[0,4,6,1],[0,5,5,1],
        [1,6,4,1],[1,7,4,1],[1,8,2,1],[4,8,1,1],[1,9,1,1],[4,9,1,1]
      ];
      for (const [bx,by,bw,bh] of blocks) ctx.fillRect(Math.round(x+bx*unit),Math.round(y+by*unit),bw*unit,bh*unit);
      ctx.fillStyle = '#f7f9f6';
      ctx.fillRect(Math.round(x+6*unit),Math.round(y+unit),unit,unit);
    }

    function drawRunner() {
      if (!runnerContext || !runnerWidth || !runnerHeight) return;
      const ctx = runnerContext;
      ctx.clearRect(0,0,runnerWidth,runnerHeight);
      ctx.strokeStyle = '#91aa94';
      ctx.lineWidth = 1;
      ctx.beginPath();ctx.moveTo(0,runnerGround+.5);ctx.lineTo(runnerWidth,runnerGround+.5);ctx.stroke();
      ctx.fillStyle = '#bfd0b7';
      for(let x=-(runnerDistance%26);x<runnerWidth;x+=26)ctx.fillRect(Math.round(x),runnerGround+6,12,1);
      drawPixelDino(runner.x,runner.y);
      ctx.fillStyle='#537064';
      for(const obstacle of obstacles){
        ctx.fillRect(Math.round(obstacle.x),runnerGround-obstacle.height,obstacle.width,obstacle.height);
        ctx.fillRect(Math.round(obstacle.x-3),runnerGround-obstacle.height+8,3,4);
        ctx.fillRect(Math.round(obstacle.x+obstacle.width),runnerGround-obstacle.height+5,3,4);
      }
      ctx.font="500 11px 'Alumni Hanken', Arial, sans-serif";
      ctx.textAlign='right';
      ctx.fillStyle='#60766b';
      ctx.fillText(String(runnerScore).padStart(4,'0'),runnerWidth-5,13);
      if (runnerDeadUntil) {
        ctx.fillStyle='rgba(247,249,246,.88)';ctx.fillRect(0,0,runnerWidth,runnerHeight);
        ctx.fillStyle='#7b463d';ctx.textAlign='center';ctx.font="500 12px 'Alumni Hanken', Arial, sans-serif";
        ctx.fillText('Oups — on repart !',runnerWidth/2,runnerHeight/2+4);
      }
    }

    function updateRunner(delta,time) {
      if (!runnerContext || !runnerWidth) return;
      if (runnerDeadUntil) {
        if (time >= runnerDeadUntil) resetRunner();
        else drawRunner();
        return;
      }
      runnerDistance += runnerSpeed * delta;
      runnerScore = Math.floor(runnerDistance / 10);
      runnerSpeed = Math.min(.34,.19+runnerScore*.00055);
      nextObstacle -= delta;
      if(nextObstacle<=0){
        const height=20+Math.round(Math.random()*15);
        obstacles.push({x:runnerWidth+10,width:8+Math.round(Math.random()*5),height});
        nextObstacle=850+Math.random()*720;
      }
      if(!runner.grounded){
        runner.velocity+=.00175*delta;
        runner.y+=runner.velocity*delta;
        const floor=runnerGround-runner.height;
        if(runner.y>=floor){runner.y=floor;runner.velocity=0;runner.grounded=true;}
      }
      for(const obstacle of obstacles)obstacle.x-=runnerSpeed*delta;
      while(obstacles[0]&&obstacles[0].x+obstacles[0].width<0)obstacles.shift();
      for(const obstacle of obstacles){
        if(runner.x+runner.width-5>obstacle.x&&runner.x+5<obstacle.x+obstacle.width&&runner.y+runner.height-4>runnerGround-obstacle.height){
          runnerDeadUntil=time+720;break;
        }
      }
      drawRunner();
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
      const delta = previousTime ? Math.min(time - previousTime, 80) : 16;
      phase += delta * 0.00017;
      previousTime = time;
      drawSphere();
      updateRunner(delta,time);
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
      fitRunnerCanvas();
      drawSphere();
      drawRunner();
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
      if (event.target instanceof Element && event.target.closest('[data-prompt], #new-chat')) scheduleQuestionFit();
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
    if (runnerGame) {
      runnerGame.addEventListener('keydown', event => {
        if (event.code === 'Space' || event.code === 'ArrowUp') {event.preventDefault();jumpRunner();}
      });
      runnerGame.addEventListener('pointerdown', event => {event.preventDefault();jumpRunner();});
    }
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
    if (runnerCanvas && typeof ResizeObserver !== 'undefined') {
      const runnerObserver = new ResizeObserver(() => {fitRunnerCanvas();drawRunner();});
      runnerObserver.observe(runnerCanvas);
    }
    syncPresentation();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startExperience, { once: true });
  else startExperience();
})();
