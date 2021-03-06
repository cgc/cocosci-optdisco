export function showModal(content) {
  $('<div>', {
    class: 'modal',
    html: $('<div>', {
      class: 'modal-content',
      html: content
    })
  }).appendTo($('#jspsych-target'));
};

export function completeModal(md, options) {
  options = options || {};
  // By default, Enter (code=13) and Space (code=32) submits.
  const keyCodeSubmit = new Set(options.keyCodeSubmit || [13, 32]);

  let resolve;
  let promise = new Promise(function(res, rej) {
    resolve = res;
  });
  const button = $('<button>', {
    class: 'btn btn-success',
    text: 'Continue',
    click: function() {
      $('.modal').remove();
      document.removeEventListener('keypress', handleEnter);
      resolve();
    }
  });
  showModal($('<div>')
    .add($('<div>', {html: markdown(md)}))
    .add(button)
  );

  // We 'click' button when enter is pressed.
  function handleEnter(e) {
    if (keyCodeSubmit.has(e.keyCode)) {
      e.preventDefault();
      button[0].click();
    }
  }
  document.addEventListener('keypress', handleEnter);
  return promise;
}

export function SetIsEqual(a, b) {
  // https://stackoverflow.com/questions/31128855/comparing-ecma6-sets-for-equality
  if (a.size !== b.size) {
    return false;
  }
  for (let item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}

export const graphics = [
/*
  '🎈','🔑','🎀','🎁','🛒','📚','📌','✏️','🔮','🔨','💰','⚙️','💎','💡','⏰','🚲',
  '✈️','🎣','🍫','🍎','🧀','🍌','🍪','🌞','⛄️','🐒','🐳','👑','👟','🤖','🤡',
*/
  '🎈','🔑','🎀','🎁','📌','✏️','🔮','💰','⚙️','💎','💡','⏰',
  '✈️','🍫','🍎','🧀','🍪','🌞','⛄️', '🐒','👑','👟', '🤖','🤡',
];

export function graphicsUrl(emoji) {
  const fn = emoji.codePointAt(0).toString(16).toUpperCase() + '.svg';
  return "static/optdisco/images/openmoji/" + fn;
}

function loadImage(src) {
  // https://stackoverflow.com/questions/52059596/loading-an-image-on-web-browser-using-promise
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", err => reject(err));
    img.src = src;
  });
};

const images = graphics.map(function(emoji) {
  return loadImage(graphicsUrl(emoji));
});

export const graphicsLoading = Promise.all(images);

export function trialErrorHandling(trial) {
  return async function() {
    return trial.apply(this, arguments).catch(handleError);
  };
};

export function addPlugin(name, func) {
  jsPsych.plugins[name] = {
    info: { name: name, parameters: {} },
    trial: trialErrorHandling(func),
  };
}

export function parseHTML(html) {
  var parser = new DOMParser();
  var parsed = parser.parseFromString(html, 'text/html');
  const children = parsed.getRootNode().body.children;
  if (children.length != 1) {
    throw new Error(`parseHTML can only parse HTML with 1 child node. Found ${children.length} nodes.`);
  }
  return children[0];
}

export function setTimeoutPromise(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Initially in https://jsfiddle.net/zoradude5/j4ogytfp/39/
function runTimerText(el, ms) {
  let resolve;
  const p = new Promise((res, rej) => { resolve = res; });

  const start = new Date();

  function update() {
    const elapsed = new Date() - start;

    // End once time is elapsed
    if (elapsed > ms+1) { // Make sure we go out past our time a bit, the 0.01 sec.
      // Clear interval! Important to end updates.
      clearInterval(inter);
      resolve();
    }

    // Render seconds: round up, and make sure we don't go below 0.
    const seconds = Math.max(0, Math.ceil((ms - elapsed) / 1000));

    // Update DOM
    el.textContent = (
      seconds == 0 ? 'Done!' :
      seconds == 1 ? '1 second left' :
      `${seconds} seconds left`
    );
  }

  // Set interval, every 100ms so we're never too late.
  const inter = setInterval(update, 100);
  // Run the first render manually.
  update();

  return p;
}

export function runTimer(root, ms) {
  // Render timer.
  root.innerHTML = `
  <div class="Timer-progressContainer"><div class="Timer-progress"></div></div>
  <span class="Timer-number"></span>
  `;

  // Animate progress bar.
  const el = root.querySelector('.Timer-progress')
  el.style.transitionDuration = `${ms}ms`;
  // Wait until next iter of event loop to make sure transition has right duration.
  setTimeout(() => {
    el.classList.add('progressing');
  }, 0);

  // Set text rendering. Also gives us a promise for completion.
  return runTimerText(root.querySelector('.Timer-number'), ms);
}

class PromiseCancellation extends Error {
  constructor() {
    super("PromiseCancellation");
    this.name = this.message;
  }
}

export function documentEventPromise(eventName, fn) {
  // Adds event handler to document that runs until the function `fn` returns a truthy value.
  const el = document;
  let cancel;
  const p = new Promise((resolve, reject) => {

    // Can be cancelled. Results in Error of PromiseCancellation.
    cancel = function() {
      el.removeEventListener(eventName, handler);
      reject(new PromiseCancellation());
    };

    function handler(e) {
      const rv = fn(e);
      if (rv) {
        el.removeEventListener(eventName, handler);
        resolve(rv);
      }
    }

    el.addEventListener(eventName, handler);
  });
  p.cancel = () => cancel();
  return p;
}

addPlugin('HTMLForm', async function(root, trial) {
  /*
  This plugin is a bit of a kitchen sink. Mostly have wanted something that is a halfway
  reasonable HTML instruction/form page.

  This plugin will generate a page with trial.stimulus content and a continue button.
  It will automatically gather from all input[type=text] and textarea elements in the stimulus.
  */
  root.innerHTML = `
    <form class="HTMLForm-form"><fieldset>
      ${markdown(trial.stimulus)}
      <input type="submit" class="btn btn-primary HTMLForm-continue" name="_submit" value="Continue" />
    </fieldset></form>
    <br /><br />
  `;
  const form = root.querySelector('.HTMLForm-form');
  const start = Date.now();

  // Validate that all form elements are named.
  const error = Array.from($(form).find(':input')).map((el) => el.getAttribute('name') ? '' : `Found input tag without name: ${el}\n`).join('');
  if (error) {
    alert(error);
    return;
  }

  const data = {
    responses: [],
    rt: [],
  };

  const continue_ = () => new Promise((resolve, reject) => {
    function handler(e) {
      // Stop form handling.
      e.preventDefault();
      // Remove listener
      form.removeEventListener('submit', handler);
      // Format data
      const fd = {};
      for (const pair of new FormData(form)) {
        fd[pair[0]] = pair[1];
      }
      data.responses.push(fd);
      // Collect RT
      data.rt.push(Date.now() - start);
      // Resolve promise
      resolve(fd);
    }
    form.addEventListener('submit', handler);
  });

  let formData = await continue_();

  if (trial.validate) {
    while (!trial.validate(formData)) {
      formData = await continue_();
    }
  }

  console.log(data);
  root.innerHTML = '';
  jsPsych.finishTrial(data);
});

addPlugin('SimpleInstruction', async function(root, trial) {
  /*
  A simple plugin that shows an instruction. Spacebar is used to progress.
  */
  root.innerHTML = trial.stimulus + markdown('\n\nPress spacebar to continue.');

  await documentEventPromise('keypress', (e) => {
    if (e.keyCode == 32) {
      e.preventDefault();
      return true;
    }
  });

  root.innerHTML = '';
  jsPsych.finishTrial();
});
