import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/tabs/home' },
  { path: '/home', redirect: '/tabs/home' }, // old address, kept so old links still work
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginPage.vue'),
    meta: { guestOnly: true },
  },
  {
    // Bottom tab layout. Children inherit requiresAuth from this parent route.
    path: '/tabs/',
    component: () => import('@/views/TabsPage.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/tabs/home' },
      { path: 'home', name: 'Home', component: () => import('@/views/HomePage.vue') },
      { path: 'profile', name: 'Profile', component: () => import('@/views/ProfilePage.vue') },
      // Master Profile sections: children of the tabs layout, so the bottom tab bar stays visible.
      { path: 'profile/personal', name: 'ProfilePersonal', component: () => import('@/views/PersonalInfoPage.vue') },
      { path: 'profile/experience', name: 'ProfileExperience', component: () => import('@/views/ExperiencePage.vue') },
      { path: 'profile/projects', name: 'ProfileProjects', component: () => import('@/views/ProjectsPage.vue') },
      { path: 'profile/education', name: 'ProfileEducation', component: () => import('@/views/EducationPage.vue') },
      { path: 'profile/skills', name: 'ProfileSkills', component: () => import('@/views/SkillsPage.vue') },
      { path: 'profile/import', name: 'ProfileImport', component: () => import('@/views/ImportResumePage.vue') },
      { path: 'jobs', name: 'Jobs', component: () => import('@/views/JobsPage.vue') },
      { path: 'tracker', name: 'Tracker', component: () => import('@/views/TrackerPage.vue') },
      // One application (documents, status, notes). A tabs child, so the tab bar stays; the id arrives as a prop.
      {
        path: 'tracker/:id',
        name: 'TrackerDetail',
        component: () => import('@/views/TrackerDetailPage.vue'),
        props: true,
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.init();

  if (to.meta.requiresAuth && !auth.isLoggedIn) return '/login';
  if (to.meta.guestOnly && auth.isLoggedIn) return '/tabs/home';
  return true;
});

export default router;
