import { mount } from '@vue/test-utils'
import ComingSoon from '@/components/ComingSoon.vue'
import { describe, expect, test } from 'vitest'

describe('ComingSoon.vue', () => {
  test('shows the title, description and the coming soon pill', () => {
    const wrapper = mount(ComingSoon, {
      props: {
        icon: 'icon-path',
        title: 'Paste a job description',
        description: 'Soon you will paste a job post here.',
      },
    })
    expect(wrapper.text()).toContain('Paste a job description')
    expect(wrapper.text()).toContain('Soon you will paste a job post here.')
    expect(wrapper.text()).toContain('Coming soon')
  })
})
