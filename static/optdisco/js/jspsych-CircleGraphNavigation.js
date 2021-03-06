import {parseHTML, runTimer, trialErrorHandling, graphicsUrl, setTimeoutPromise, addPlugin, documentEventPromise} from './utils.js';
import {bfs} from './graphs.js';

const SUCCESSOR_KEYS = ['J', 'K', 'L'];

export class CircleGraph {
  constructor(options) {
    this.options = options;
    options.edgeShow = options.edgeShow || (() => true);
    options.successorKeys = options.graphRenderOptions.successorKeys || options.stateOrder.map(() => SUCCESSOR_KEYS);
    let gro = options.graphRenderOptions;
    // We have a rendering function for keys. Defaults to identity for keys that can be rendered directly.
    gro.successorKeysRender = gro.successorKeysRender || (key => key);

    this.el = parseHTML(renderCircleGraph(
      options.graph, options.graphics, options.goal, options.stateOrder,
      {
        edgeShow: options.edgeShow,
        successorKeys: options.successorKeys,
        probe: options.probe,
        ...options.graphRenderOptions,
      }
    ));

    this.setCurrentState(options.start);

    // Making sure it is easy to clean up event listeners...
    this.cancellables = [];
  }

  async showMap(options={}) {
    const start = Date.now();
    const data = {states: [], times: [], durations: []};

    this.el.classList.add('hideStates');

    for (const el of this.el.querySelectorAll('.State')) {
      const state = parseInt(el.getAttribute('data-state'), 10);
      let enter;
      el.addEventListener('mouseenter', (e) => {
        el.classList.add('is-visible');
        // When visible, we mark state & time.
        data.states.push(state);
        data.times.push(Date.now() - start);
        // Record time we show to compute a duration.
        enter = Date.now();
        // Event listener
        options.onmouseenter && options.onmouseenter(state);
      });
      el.addEventListener('mouseleave', (e) => {
        el.classList.remove('is-visible');
        // When hiding, we record duration of visibility.
        data.durations.push(Date.now() - enter);
        // Event listener
        options.onmouseleave && options.onmouseleave(state);
      });
    }

    if (!options.skipWait) {
      await waitForSpace();
    }

    return data;
  }

  cancel() {
    // Use this for early termination of the graph.
    // Only used during free-form graph navigation.
    for (const c of this.cancellables) {
      c();
    }
    this.cancellables = [];
  }

  setCurrentState(state, options) {
    this.state = state;
    setCurrentState(this.el, this.options.graph, this.state, {
      edgeShow: this.options.edgeShow,
      successorKeys: this.options.successorKeys,
      onlyShowCurrentEdges: this.options.graphRenderOptions.onlyShowCurrentEdges,
      ...options,
    });
  }

  keyCodeToState(keyCode) {
    /*
    Mapping keyCode to states.
    */
    const key = String.fromCharCode(keyCode).toUpperCase();
    const idx = this.options.successorKeys[this.state].indexOf(key);
    if (idx === -1) {
      return null;
    }
    const succ = this.options.graph.graph[this.state][idx];
    if (!this.options.edgeShow(this.state, succ)) {
      return null;
    }
    return succ;
  }

  keyTransition() {
    /*
    Returns a promise that is resolved with {state} when there is a keypress
    corresponding to a valid state transition.
    */
    const p = documentEventPromise('keydown', (e) => {
      const state = this.keyCodeToState(e.keyCode);
      if (state !== null) {
        e.preventDefault();
        return {state};
      }
    });

    this.cancellables.push(p.cancel);

    return p;
  }

  clickTransition(options) {
    options = options || {};
    /*
    Returns a promise that is resolved with {state} when there is a click
    corresponding to a valid state transition.
    */
    const invalidStates = new Set(options.invalidStates || [this.state, this.options.goal]);

    for (const s of this.options.graph.states) {
      if (invalidStates.has(s)) {
        continue;
      }
      const el = this.el.querySelector(`.GraphNavigation-State-${s}`);
      el.classList.add('PathIdentification-selectable');
    }

    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const el = $(e.target).closest('.PathIdentification-selectable').get(0);
        if (!el) {
          return;
        }
        e.preventDefault();
        const state = parseInt(el.getAttribute('data-state'), 10);

        this.el.removeEventListener('click', handler);
        resolve({state});
      }

      this.el.addEventListener('click', handler);
    });
  }

  async navigate(options) {
    options = options || {};
    const termination = options.termination || ((state, states) => state == this.options.goal);
    /*
    Higher-order function that stitches together other class methods
    for an interactive key-based navigation.
    */
    const startTime = Date.now();
    const data = {
      times: [],
      states: [this.state],
    };

    while (true) {
      // State transition
      const {state} = await this.keyTransition();
      // Record information
      data.states.push(state);
      data.times.push(Date.now() - startTime);
      // Termination condition, intentionally avoiding calling cg.setCurrentState() below to avoid rendering.
      if (termination(state, data.states)) {
        break;
      }
      // Update state
      this.setCurrentState(state);
      // Taking a pause...
      await setTimeoutPromise(200);
    }

    return data;
  }

  changeXY(xy) {
    /*
    This function is a pretty big hack only intended for use when animating between
    the two projections.
    */
    const gro = this.options.graphRenderOptions;
    //this.el.classList.add('animate'); // HACK
    xy = graphXY(
      this.options.stateOrder,
      gro.width || 600, gro.height || 600,
      gro.radiusX || 250,
      gro.radiusY || 250,
      gro.scaleEdgeFactor || 0.95,
      xy,
    );
    const states = Array.from(this.el.querySelectorAll('.State'));
    const blockSize = 100; // HACK
    for (const el of states) {
      const s = parseInt(el.dataset.state, 10);
      const [x, y] = xy.coordinate[s];
      el.style.transform = `translate(${x-blockSize/2}px, ${y-blockSize/2}px)`;
      for (const ns of this.options.graph.graph[s]) {
        if (s >= ns) {
          continue;
        }
        const e = xy.edge(s, ns);
        const edge = this.el.querySelector(`.GraphNavigation-edge-${s}-${ns}`);
        edge.style.width = `${e.norm}px`;
        edge.style.transform = `translate(${x}px,${y}px) rotate(${e.rot}rad)`;
      }
    }
  }
}

const stateTemplate = (state, graphic, options) => {
  let cls = `GraphNavigation-State-${state}`;
  if (options.goal) {
    cls += ' GraphNavigation-goal';
  }
  if (options.probe) {
    cls += ' GraphNavigation-probe';
  }
  return `
  <div class="State GraphNavigation-State ${cls || ''}" style="${options.style || ''}" data-state="${state}"><img src="${graphicsUrl(graphic)}" /></div>
  `;
};

export const renderSmallEmoji = (graphic, cls) => `
<span class="GraphNavigation withGraphic">
  <span style="position: relative; border-width:1px !important;width:4rem;height:4rem;display:inline-block;margin: 0 0 -0.5rem 0;" class="GraphNavigation-State State ${cls||''}">${graphic?`<img src="${graphicsUrl(graphic)}" />`:''}</span>
</span>
`;

function keyForCSSClass(key) {
  // Using charcode here, for unrenderable keys like arrows.
  return key.charCodeAt(0);
}

function graphXY(stateOrder, width, height, radiusX, radiusY, scaleEdgeFactor, fixedXY) {
  /*
  This function computes the pixel placement of nodes and edges, given the parameters.
  */
  width = width || 600;
  height = height || 600;
  radiusY = radiusY || 250;
  radiusX = radiusX || 250;
  const offsetX = width / 2;
  const offsetY = height / 2;

  function scaleEdge(pos, offset) {
    /*
    We scale edges/keys in to ensure that short connections avoid overlapping node borders.
    */
    return (pos - offset) * scaleEdgeFactor + offset;
  }

  function scaleCoordinate([x, y]) {
    return [
      scaleEdge(x, offsetX),
      scaleEdge(y, offsetY),
    ];
  }

  const coordinate = {};
  const scaled = {};

  stateOrder.forEach((state, idx) => {
    let x, y;
    if (fixedXY) {
      [x, y] = fixedXY[state];
    } else {
      const angle = idx * 2 * Math.PI / stateOrder.length;
      x = Math.cos(angle);
      y = Math.sin(angle);
    }
    x = x * radiusX + offsetX;
    y = y * radiusY + offsetY;
    coordinate[state] = [x, y];
    scaled[state] = scaleCoordinate([x, y]);
  });

  return {
    coordinate,
    scaled,
    edge(state, successor) {
      const [x, y] = scaled[state];
      const [sx, sy] = scaled[successor];
      const norm = Math.sqrt(Math.pow(x-sx, 2) + Math.pow(y-sy, 2));
      const rot = Math.atan2(sy-y, sx-x);
      return {norm, rot};
    },
  };
}

function renderCircleGraph(graph, gfx, goal, stateOrder, options) {
  options = options || {};
  options.edgeShow = options.edgeShow || (() => true);
  const successorKeys = options.successorKeys;
  /*
  fixedXY: Optional parameter. This requires x,y coordinates that are in
  [-1, 1]. The choice of range is a bit arbitrary; results from code that assumes
  the output of sin/cos.
  */
  // Controls how far the key is from the node center. Scales keyWidth/2.
  const keyDistanceFactor = options.keyDistanceFactor || 1.4;

  const width = options.width || 600;
  const height = options.height || 600;
  const blockSize = 100;

  const xy = graphXY(
    stateOrder,
    width, height,
    options.radiusX || 250,
    options.radiusY || 250,
    // Scales edges and keys in. Good for when drawn in a circle
    // since it can help avoid edges overlapping neighboring nodes.
    options.scaleEdgeFactor || 0.95,
    options.fixedXY,
  );

  const states = stateOrder.map(state => {
    const [x, y] = xy.coordinate[state];
    return stateTemplate(state, gfx[state], {
      probe: state == options.probe,
      goal: state == goal,
      style: `transform: translate(${x - blockSize/2}px,${y - blockSize/2}px);`,
    });
  });

  function addKey(key, state, successor, norm) {
    const [x, y] = xy.scaled[state];
    const [sx, sy] = xy.scaled[successor];
    const [keyWidth, keyHeight] = [20, 28]; // HACK get from CSS
    // We also add the key labels here
    const mul = keyDistanceFactor * blockSize / 2;
    keys.push(`
      <div class="GraphNavigation-key GraphNavigation-key-${state}-${successor} GraphNavigation-key-${keyForCSSClass(key)}" style="
        transform: translate(
          ${x - keyWidth/2 + mul * (sx-x)/norm}px,
          ${y - keyHeight/2 + mul * (sy-y)/norm}px)
      ">${options.successorKeysRender(key)}</div>
    `);
  }

  const succ = [];
  const keys = [];
  for (const state of graph.states) {
    let [x, y] = xy.scaled[state];

    graph.graph[state].forEach((successor, idx) => {
      if (state >= successor) {
        return;
      }
      const e = xy.edge(state, successor);
      const opacity = options.edgeShow(state, successor) ? 1 : 0;
      succ.push(`
        <div class="GraphNavigation-edge GraphNavigation-edge-${state}-${successor}" style="
        width: ${e.norm}px;
        opacity: ${opacity};
        transform: translate(${x}px,${y}px) rotate(${e.rot}rad);
        "></div>
      `);

      // We also add the key labels here
      addKey(successorKeys[state][idx], state, successor, e.norm);
      addKey(successorKeys[successor][graph.graph[successor].indexOf(state)], successor, state, e.norm);
    });
  }

  return `
  <div class="GraphNavigation withGraphic" style="width: ${width}px; height: ${height}px;">
    ${keys.join('')}
    ${succ.join('')}
    ${states.join('')}
  </div>
  `;
}

function queryEdge(root, state, successor) {
  /*
  Returns the edge associated with nodes `state` and `successor`. Since we only
  have undirected graphs, they share an edge, so some logic is needed to find it.
  */
  if (state < successor) {
    return root.querySelector(`.GraphNavigation-edge-${state}-${successor}`);
  } else {
    return root.querySelector(`.GraphNavigation-edge-${successor}-${state}`);
  }
}

function setCurrentState(display_element, graph, state, options) {
  options = options || {};
  options.edgeShow = options.edgeShow || (() => true);
  // showCurrentEdges enables rendering of current edges/keys. This is off for PathIdentification and AcceptReject.
  options.showCurrentEdges = typeof(options.showCurrentEdges) === 'undefined' ? true : options.showCurrentEdges;
  const allKeys = _.unique(_.flatten(options.successorKeys));

  const successorKeys = options.successorKeys[state];

  // Remove old classes!
  function removeClass(cls) {
    const els = display_element.querySelectorAll('.' + cls);
    for (const e of els) {
      e.classList.remove(cls);
    }
  }
  removeClass('GraphNavigation-current')
  removeClass('GraphNavigation-currentEdge')
  removeClass('GraphNavigation-currentKey')
  for (const key of allKeys) {
    removeClass(`GraphNavigation-currentEdge-${keyForCSSClass(key)}`)
    removeClass(`GraphNavigation-currentKey-${keyForCSSClass(key)}`)
  }

  // Can call this to clear out current state too.
  if (state == null) {
    return;
  }

  // Add new classes! Set current state.
  display_element.querySelector(`.GraphNavigation-State-${state}`).classList.add('GraphNavigation-current');

  if (!options.showCurrentEdges) {
    return;
  }

  if (options.onlyShowCurrentEdges) {
    for (const el of display_element.querySelectorAll('.GraphNavigation-edge,.GraphNavigation-key')) {
      el.style.opacity = 0;
    }
  }

  graph.graph[state].forEach((successor, idx) => {
    if (!options.edgeShow(state, successor)) {
      return;
    }

    // Set current edges
    let el = queryEdge(display_element, state, successor);
    el.classList.add('GraphNavigation-currentEdge');
    el.classList.add(`GraphNavigation-currentEdge-${keyForCSSClass(successorKeys[idx])}`);
    if (options.onlyShowCurrentEdges) {
      el.style.opacity = 1;
    }

    // Now setting active keys
    el = display_element.querySelector(`.GraphNavigation-key-${state}-${successor}`);
    el.classList.add('GraphNavigation-currentKey');
    el.classList.add(`GraphNavigation-currentKey-${keyForCSSClass(successorKeys[idx])}`);
    if (options.onlyShowCurrentEdges) {
      el.style.opacity = 1;
    }
  });
}

function enableHoverEdges(display_element, graph) {
  for (const el of display_element.querySelectorAll('.GraphNavigation-State')) {
    el.addEventListener('mouseenter', function(e) {
      const state = parseInt(el.dataset.state, 10);
      // hovers.push({state, time: Date.now() - startTime});

      for (const edge of display_element.querySelectorAll('.GraphNavigation-edge')) {
        edge.classList.add('is-faded');
      }
      for (const successor of graph.graph[state]) {
        const el = queryEdge(display_element, state, successor);
        el.classList.remove('is-faded');
      }
    });
    el.addEventListener('mouseleave', function(e) {
      for (const edge of display_element.querySelectorAll('.GraphNavigation-edge')) {
        edge.classList.remove('is-faded');
      }
    });
  }
}

async function waitForSpace() {
  return documentEventPromise('keypress', (e) => {
    if (e.keyCode == 32) {
      e.preventDefault();
      return true;
    }
  });
}

async function maybeShowMap(root, trial) {
  const data = {showMap: trial.showMap};
  if (!trial.showMap) {
    return data;
  }
  const start = Date.now();

  // Show map
  const planar = new CircleGraph({...trial, graphRenderOptions: trial.planarOptions, start: null, goal: null, probe: null});
  root.innerHTML = markdown(`
    Here is an unscrambled map of all the connections you will use to navigate. **This has the exact same locations and connections as when you navigate.**

    You will see this map every two trials. **Hover to reveal** the picture for it.

    Take a moment to look at the map, then **press spacebar to continue**.
  `);
  root.appendChild(planar.el);

  // Wait for map, collect data
  const mapInteractions = await planar.showMap();
  Object.assign(data, mapInteractions);
  data.rt = Date.now() - start;

  root.innerHTML = '';

  return data;
}

addPlugin('MapInstruction', trialErrorHandling(async function(root, trial) {
  const opts = {width: 800, height: 600, radiusX: 210, radiusY: 210, scaleEdgeFactor: 1.};
  const cg = new CircleGraph({
    ...trial,
    graphRenderOptions: {...trial.graphRenderOptions, ...opts},
    start: null, goal: null, probe: null,
  });
  // Computing the angle-based coordinates to interpolate with our fixed ones.
  const anglebased = new Array(trial.stateOrder.length);
  const interp = new Array(trial.stateOrder.length);
  trial.stateOrder.forEach((state, idx) => {
    const angle = idx * 2 * Math.PI / trial.stateOrder.length;
    anglebased[state] = [Math.cos(angle), Math.sin(angle)];
    interp[state] = [0, 0];
  });
  function interpolateXY(percent) {
    /*
    We don't simply animate the transform/width
    attributes since they lead to something strange looking;
    Each attribute animates independently, but the mapping
    from x/y to rot/width is not linear, so the edges don't
    track the nodes. We're instead computing a frame-by-frame
    linear interpolation of desired XY, then mapping that to
    the necessary transform/width parameters for edges.
    */
    const from = anglebased;
    const to = trial.planarOptions.fixedXY;
    // Compute interpolation between the two positions.
    for (let s = 0; s < trial.stateOrder.length; s++) {
      interp[s][0] = (1-percent) * from[s][0] + percent * to[s][0];
      interp[s][1] = (1-percent) * from[s][1] + percent * to[s][1];
    }
    cg.changeXY(interp);
  }
  // Rendering
  interpolateXY(0);
  const inst = document.createElement('p');
  inst.style.minHeight = '60px';
  inst.style.marginBottom = '-50px';
  root.appendChild(inst);
  root.appendChild(cg.el);

  // Intro
  inst.innerHTML = 'Every other trial, we will show you an unscrambled map.<br />Press spacebar to unscramble this map.';
  await waitForSpace();

  // Animating...
  inst.textContent = '';
  const animDuration = 2000;
  const animStart = Date.now();
  function animateFrame() {
    let percent = (Date.now() - animStart) / animDuration;
    if (percent >= 1) {
      interpolateXY(1);
      return
    }
    interpolateXY(percent);
    window.requestAnimationFrame(animateFrame);
  }
  animateFrame();
  window.requestAnimationFrame(animateFrame);
  await setTimeoutPromise(animDuration);

  // Map
  const limit = 3;
  const locations = new Set();
  inst.innerHTML = markdown(`You need to **hover to see the icons**. Hover over ${limit} different locations.`);
  cg.el.querySelectorAll('img').forEach(el => el.style.transition = 'opacity 600ms');
  let resolve;
  const p = new Promise((res, rej) => {resolve = res});
  await cg.showMap({
    skipWait: true,
    onmouseenter(s) {
      locations.add(s);
      if (locations.size >= limit) {
        resolve();
        return;
      }
      inst.textContent = `${limit-locations.size} left!`
    }
  });
  await p;

  // End
  inst.textContent = 'Great job! Now press spacebar to continue the HIT.'
  await waitForSpace();
  jsPsych.finishTrial();
}));

addPlugin('CircleGraphNavigation', trialErrorHandling(async function(root, trial) {
  console.log(trial);

  const mapData = await maybeShowMap(root, trial);

  const cg = new CircleGraph(trial);
  root.innerHTML = `
  Navigate to ${renderSmallEmoji(trial.graphics[trial.goal], 'GraphNavigation-goal')}. It might be helpful to set subgoals.
  `;
  root.appendChild(cg.el);

  const data = await cg.navigate();

  await endTrialScreen(root);

  root.innerHTML = '';
  data.practice = trial.practice;
  data.mapData = mapData;
  console.log(data);
  jsPsych.finishTrial(data);
}));

addPlugin('VisitNeighbors', trialErrorHandling(async function(root, trial) {
  console.log(trial);

  function edgeShow(state, succ) {
    return trial.start == state || trial.start == succ;
  }

  const cg = new CircleGraph({...trial, edgeShow});
  root.innerHTML = `
    Visit *all* the locations connected to your starting location.
    Then return to the start place!
  `;
  root.appendChild(cg.el);
  cg.el.querySelector('.GraphNavigation-current').classList.add('GraphNavigation-visited');

  const neighbors = trial.graph.graph[trial.start];
  const data = await cg.navigate({termination: function(state, states) {
    // Kind of a HACK.
    cg.el.querySelector(`.GraphNavigation-State-${state}`).classList.add('GraphNavigation-visited');
    states = new Set(states);
    return state == trial.start && neighbors.every(n => states.has(n));
  }});

  await endTrialScreen(root);

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));

addPlugin('CGTransition', trialErrorHandling(async function(root, trial) {
  console.log(trial);

  const instruction = document.createElement('div');
  instruction.classList.add('GraphNavigation-instruction');
  root.appendChild(instruction);
  instruction.innerHTML = `Study the connections of the ${renderSmallEmoji(null, 'GraphNavigation-cue')}. You\'ll be quizzed on one of them. Press spacebar to continue.`;

  const cg = new CircleGraph({...trial, start: null});
  root.appendChild(cg.el);

  const cues = trial.cues.map(state => cg.el.querySelector(`.GraphNavigation-State-${state}`));
  cues.forEach(cue => cue.classList.add('GraphNavigation-cue'));

  await documentEventPromise('keypress', (e) => {
    if (e.keyCode == 32) {
      e.preventDefault();
      return true;
    }
  });

  instruction.innerHTML = '<br />';
  Array.from(cg.el.querySelectorAll('.GraphNavigation-edge')).forEach(el => { el.style.opacity = 0; });

  await setTimeoutPromise(500);

  cues.forEach(cue => cue.classList.remove('GraphNavigation-cue'));
  cg.setCurrentState(trial.start, {showCurrentEdges: false});

  const start = Date.now();
  const data = {states: [], times: []};
  let totalCorrect = 0;
  const neighbors = trial.graph.graph[trial.start];

  for (const t of _.range(3)) {
    const left = 3-t;
    instruction.textContent = `Click on the connected locations! ${left} click${left==1?'':'s'} left.`;

    const {state} = await cg.clickTransition({invalidStates: [trial.start].concat(data.states)});
    data.states.push(state);
    data.times.push(Date.now() - start);

    const el = cg.el.querySelector(`.GraphNavigation-State-${state}`);
    el.classList.remove('PathIdentification-selectable');
    el.style.backgroundColor = 'grey';

    const correct = neighbors.includes(state);
    if (correct) {
      totalCorrect++;
    }
  }

  Array.from(cg.el.querySelectorAll('.GraphNavigation-edge')).forEach(el => { el.style.opacity = 1; });
  instruction.innerHTML = `
    You correctly guessed ${totalCorrect}. Press spacebar or click to continue.
  `;

  for (const state of new Set(neighbors.concat(data.states))) {
    const el = cg.el.querySelector(`.GraphNavigation-State-${state}`);
    el.classList.remove('PathIdentification-selectable');

    if (neighbors.includes(state)) {
      // Correct selection
      if (data.states.includes(state)) {
        el.style.backgroundColor = 'green';
      // Correct, but not selected
      } else {
        el.style.border = '4px solid green';
        el.style.backgroundColor = 'white';
      }
    } else {
      // Incorrect selection
      el.style.backgroundColor = 'red';
    }
  }

  await documentEventPromise('keypress', (e) => {
    if (e.keyCode == 32) {
      e.preventDefault();
      return true;
    }
  });

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));

addPlugin('CirclePathIdentification', trialErrorHandling(async function(root, trial) {
  console.log(trial);
  if (!trial.identifyOneState) {
    throw new Error('No path selection supported. Only one-state selection.');
  }

  const mapData = await maybeShowMap(root, trial);

  const {start, goal, graph, graphics, stateOrder} = trial;
  const solution = bfs(graph, start, goal).path;

  const intro = trial.copy == 'busStop' ? `
    <p>Imagine a version of this task that includes <b>instant teleportation</b> to one location of your choice. The task is otherwise exactly the same: you navigate between the same locations along the same connections, but you can also teleport to the location you choose.</p>

    <p>If you did the task again, which location would you choose to use for instant teleportation?</p>
  ` : trial.copy == 'solway2014' ? `
    <p>Plan how to get from ${renderSmallEmoji(graphics[start], 'GraphNavigation-current')} to ${renderSmallEmoji(graphics[goal], 'GraphNavigation-goal')}. Choose a location you would visit along the way.</p>
  ` : trial.copy == 'subgoal' ? `
    <p>When navigating from ${renderSmallEmoji(graphics[start], 'GraphNavigation-current')} to ${renderSmallEmoji(graphics[goal], 'GraphNavigation-goal')}, what location would you set as a subgoal? (If none, click on the goal).</p>
  ` : `ERROR: Invalid trial copy ${trial}`;

  const cg = new CircleGraph({...trial, start: null});
  cg.setCurrentState(start, {showCurrentEdges: false});
  root.innerHTML = `${intro}`;
  root.appendChild(cg.el);

  const startTime = Date.now();
  const data = {
    times: [],
    states: [],
    copy: trial.copy,
    practice: trial.practice,
  };

  const invalidStates = {
    subgoal: [trial.start],
    solway2014: [trial.start, trial.goal],
    busStop: [],
  }[trial.copy];
  const {state} = await cg.clickTransition({invalidStates});

  data.states.push(state);
  data.times.push(Date.now() - startTime);
  data.mapData = mapData;

  await endTrialScreen(root);

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));

function endTrialScreen(root, msg) {
  root.innerHTML = `<h2 style="margin-top: 20vh;margin-bottom:100vh;">${msg || ''}Press spacebar to continue.</h2>`;
  return documentEventPromise('keypress', (e) => {
    if (e.keyCode == 32) {
      e.preventDefault();
      return true;
    }
  });
}

function renderKeyInstruction(keys) {
  function renderInputInstruction(inst) {
    return `<span style="border: 1px solid black; border-radius: 3px; padding: 3px; font-weight: bold; display: inline-block;">${inst}</span>`;
  }

  if (keys.accept == 'Q') {
    return `${renderInputInstruction('Yes (q)')} &nbsp; ${renderInputInstruction('No (p)')}`;
  } else {
    return `${renderInputInstruction('No (q)')} &nbsp; ${renderInputInstruction('Yes (p)')}`;
  }
}

addPlugin('AcceptRejectPractice', trialErrorHandling(async function(root, trial) {
  const {expectedResponse, acceptRejectKeys: keys} = trial;
  root.innerHTML = `
    Respond with "${expectedResponse == keys.accept ? 'Yes' : 'No'}".
    <br/><br/><br/>
    ${renderKeyInstruction(keys)}
    <br/>
  `;

  await documentEventPromise('keypress', e => {
    const input = String.fromCharCode(e.keyCode);
    if (input.toUpperCase() == expectedResponse) {
      e.preventDefault();
      return true;
    }
  });

  await endTrialScreen(root, 'Great!<br /><br />');

  root.innerHTML = '';
  jsPsych.finishTrial({practice: true});
}));

addPlugin('AcceptReject', trialErrorHandling(async function(root, trial) {
  const {start, goal, graph, graphics, stateOrder, probe, acceptRejectKeys: keys} = trial;

  const mapData = await maybeShowMap(root, trial);

  const intro = `
  <p>Navigating from ${renderSmallEmoji(graphics[start], 'GraphNavigation-current')} to ${renderSmallEmoji(graphics[goal], 'GraphNavigation-goal')}.
  Will you pass ${renderSmallEmoji(graphics[probe], 'GraphNavigation-probe')}?<br />
  ${renderKeyInstruction(keys)}
  `;
  root.innerHTML = `${intro}`;
  const cg = new CircleGraph({...trial, start: null});
  cg.setCurrentState(start, {showCurrentEdges: false});
  root.appendChild(cg.el);

  const startTime = Date.now();

  const data = await documentEventPromise('keypress', e => {
    const input = String.fromCharCode(e.keyCode).toUpperCase();
    for (const response of Object.keys(keys)) {
      if (input == keys[response]) {
        e.preventDefault();
        return {response};
      }
    }
  });

  console.log(data);
  data.practice = trial.practice;
  data.rt = Date.now() - startTime;
  data.mapData = mapData;

  await endTrialScreen(root);

  root.innerHTML = '';
  jsPsych.finishTrial(data);
}));
