import { describe, expect, it } from 'vitest';
import { bottomTabFor, pickActiveSection } from './section-scroll-spy';

describe('pickActiveSection', () => {
  const sections = [
    { id: 'homepage', top: -900 },
    { id: 'about', top: -200 },
    { id: 'projects', top: 80 },
    { id: 'faq', top: 600 },
    { id: 'contact', top: 1200 },
  ];

  it('returns the last section whose top has crossed the offset line', () => {
    expect(pickActiveSection(sections, 120, false)).toBe('projects');
  });

  it('falls back to homepage when no section has reached the line yet', () => {
    expect(pickActiveSection([{ id: 'about', top: 500 }], 120, false)).toBe('homepage');
  });

  it('activates the last section at the bottom of the page even if it never reaches the line', () => {
    expect(pickActiveSection(sections, 120, true)).toBe('contact');
  });

  it('activates sections without a nav link too (faq), so the previous link does not stay lit', () => {
    expect(pickActiveSection([...sections.slice(0, 3), { id: 'faq', top: 10 }, sections[4]], 120, false)).toBe('faq');
  });

  it('returns the fallback for a page with no sections', () => {
    expect(pickActiveSection([], 120, true)).toBe('homepage');
  });
});

describe('bottomTabFor', () => {
  it('follows the scroll-spy on the homepage', () => {
    expect(bottomTabFor(true, 'homepage')).toBe('home');
    expect(bottomTabFor(true, 'projects')).toBe('projects');
    expect(bottomTabFor(true, 'services')).toBe('services');
    expect(bottomTabFor(true, 'skills')).toBe('other');
  });

  it('never lights the Home tab outside the homepage (regression: /contact showed Home active)', () => {
    expect(bottomTabFor(false, 'homepage', '/contact')).toBe('other');
  });

  it('keeps the Projects tab active on the standalone /projects page', () => {
    expect(bottomTabFor(false, '', '/projects')).toBe('projects');
  });
});
