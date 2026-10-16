// A single place for product events (recipe opened, saved, planned...). Nothing is collected or sent yet:
// events are only announced inside the page, so an analytics tool can be connected here later with consent.
export function track(name, details = {}) {
  window.dispatchEvent(new CustomEvent('wh:event', {detail: {name, ...details}}));
}
