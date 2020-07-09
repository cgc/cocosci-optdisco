import {completeModal, addPlugin, graphicsUrl, parseHTML, setTimeoutPromise} from './utils.js';
import {CircleGraph, renderSmallEmoji} from './jspsych-CircleGraphNavigation.js';

addPlugin('CircleGraphNavigationInstruction', async function(root, trial) {
  console.log(trial);

  const {start, goal, graph, graphics, stateOrder} = trial;
  const intermed = 2; // HACK!

  const allKeys = _.unique(_.flatten(trial.graphRenderOptions.successorKeys));

  function edgeShow(state, succ) {
    const valid = new Set([2]);
    return valid.has(state) || valid.has(succ);
  }

  const cg = new CircleGraph({
    ...trial,
    start: null,
    edgeShow,
  });
  root.innerHTML = `<div class="GraphNavigation-instruction"></div>`;//`${graphEl}`;
  root.appendChild(cg.el);
  const instruction = root.querySelector('.GraphNavigation-instruction');

  cg.el.querySelector('.GraphNavigation-edge-0-2').style.opacity = 0;
  cg.el.querySelector('.GraphNavigation-edge-1-2').style.opacity = 0;
  cg.el.querySelector('.GraphNavigation-edge-2-3').style.opacity = 0;

  const goalEl = cg.el.querySelector('.GraphNavigation-goal');
  goalEl.classList.remove('GraphNavigation-goal');

  function makeButtonPromise() {
    return new Promise((resolve, reject) => {
      root.querySelector('button').addEventListener('click', () => resolve());
    });
  }

  function renderKey(key) {
    return `<span
      class="GraphNavigation-key GraphNavigation-key-${key}"
      style="opacity: 1; position: relative; display: inline-block;">${key}</span>`;
  }

  const timeline = [
    {
      pre: () => {},
      html: markdown(`
        Thanks for accepting our HIT! In this HIT, you will play a game
        with these locations.

        <button>Next</button>
      `),
      makePromise: makeButtonPromise,
    },
    {
      pre: () => {
        cg.el.querySelector('.GraphNavigation-edge-0-2').style.opacity = 1;
      },
      html: markdown(`
        Each location is connected with several other locations, shown by a line between them.
        For example, the two locations below are connected.

        <button>Next</button>
      `),
      makePromise: makeButtonPromise,
    },
    {
      pre: () => {},
      html: markdown(`
        You can move to different locations by typing the letter shown on the line. Your current location is indicated by ${renderSmallEmoji(null, 'GraphNavigation-current')}.
      `),
      makePromise: () => {
        cg.setCurrentState(start);
        return cg.keyTransition();
      },
    },
    {
      pre: () => {
        goalEl.classList.add('GraphNavigation-goal');
        cg.el.querySelector('.GraphNavigation-edge-1-2').style.opacity = 1;
        cg.el.querySelector('.GraphNavigation-edge-2-3').style.opacity = 1;
      },
      html: markdown(`
        Great! Your goal is marked with a star ${renderSmallEmoji(graphics[goal], 'GraphNavigation-goal')}. Try going there now.

        Press the ${allKeys.map(renderKey).join(', ')} keys to navigate.
      `),
      makePromise: () => {
        cg.setCurrentState(intermed);
        return cg.navigate();
      },
    },
    {
      pre: async () => {
        // Remove goal
        cg.options.goal = null;
        cg.el.querySelector('.GraphNavigation-goal').classList.remove('GraphNavigation-goal');
        // Show all edges
        cg.options.edgeShow = () => true;
        Array.from(cg.el.querySelectorAll('.GraphNavigation-edge')).forEach(el => { el.style.opacity = 1; });
        // Transition to goal (from last step)
        cg.setCurrentState(goal);
        // Free-form navigation!
        cg.navigate().catch(err => {
          // Cancellation causes an error, so we ignore it.
          if (err.name != 'PromiseCancellation') {
            throw err;
          }
        });
      },
      html: markdown(`
        The task will consist of ${trial.trialsLength} trials with the connections shown below. The connections will be displayed at all times.

        Please take a moment to explore with the ${allKeys.map(renderKey).join(', ')} keys.

        Whenever you're ready: <button>Start the task</button>
      `),
      makePromise: makeButtonPromise,
    },
  ];

  for (const t of timeline) {
    t.pre();
    instruction.innerHTML = t.html;
    await t.makePromise();
  }

  // Cancel the free-form navigation that we started above.
  cg.cancel();

  root.innerHTML = '';
  jsPsych.finishTrial();
});
