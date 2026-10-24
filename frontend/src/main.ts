import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

import { IonicVue } from '@ionic/vue';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/* Follows the phone's light/dark setting */
import '@ionic/vue/css/palettes/dark.system.css';

/* daisyUI themes (Tailwind without its reset), then the bridge to Ionic's colors */
import './theme/daisy.css';
import './theme/variables.css';
import './theme/motion.css';
import './theme/ui.css';

import { useThemeStore } from './stores/theme';
import { prefersReducedMotion } from './services/motion';

const app = createApp(App)
  .use(IonicVue, { animated: !prefersReducedMotion() }) // no page slide animations if the user asked for less motion
  .use(createPinia()) // Pinia must be installed before the router guard runs
  .use(router);

useThemeStore().init(); // set data-theme before the first screen is shown

router.isReady().then(() => {
  app.mount('#app');
});
