// Six seven-segment digits with beveled edges, matching the supplied reference.
const NS = 'http://www.w3.org/2000/svg';
const SEGMENTS = [
  '14,0 81,0 70,12 24,12',      // a top
  '83,3 95,15 95,67 83,79 83,18', // b upper right
  '83,83 95,95 95,143 83,155 83,96', // c lower right
  '24,147 70,147 81,159 14,159', // d bottom
  '0,95 12,83 12,141 0,153',  // e lower left
  '0,15 12,3 12,63 0,77',      // f upper left
  '15,79 24,72 70,72 80,79 70,86 24,86', // g middle
];
const MAP = {
  '0': [0, 1, 2, 3, 4, 5], '1': [1, 2],
  '2': [0, 1, 6, 4, 3], '3': [0, 1, 6, 2, 3],
  '4': [5, 6, 1, 2], '5': [0, 5, 6, 2, 3],
  '6': [0, 5, 6, 4, 2, 3], '7': [0, 1, 2],
  '8': [0, 1, 2, 3, 4, 5, 6], '9': [0, 1, 2, 3, 5, 6],
};

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export function createSevenSegment(container) {
  const svg = svgElement('svg', {
    viewBox: '0 0 760 160',
    role: 'img',
    'aria-label': '00:46:00',
    preserveAspectRatio: 'xMidYMid meet',
    class: 'seven-segment',
  });
  const digits = [];
  let x = 4;
  for (let position = 0; position < 8; position += 1) {
    if (position === 2 || position === 5) {
      for (const y of [46, 111]) {
        svg.append(svgElement('rect', { x: x + 8, y, width: 13, height: 13, rx: 1.4, class: 'colon-dot' }));
      }
      x += 40;
      continue;
    }
    const group = svgElement('g', { transform: `translate(${x} 0)` });
    const paths = SEGMENTS.map((points) => {
      const polygon = svgElement('polygon', { points, class: 'segment' });
      group.append(polygon);
      return polygon;
    });
    svg.append(group);
    digits.push(paths);
    x += 111;
  }
  // No clipping at the end; the calculated digit row is 746 wide.
  container.replaceChildren(svg);
  let previousText = '';
  function set(text) {
    if (text === previousText) return;
    previousText = text;
    svg.setAttribute('aria-label', text);
    const values = text.replaceAll(':', '');
    digits.forEach((paths, index) => {
      const enabled = MAP[values[index]] ?? [];
      paths.forEach((segment, segmentIndex) => {
        segment.classList.toggle('active', enabled.includes(segmentIndex));
      });
    });
  }
  set('00:46:00');
  return { set };
}
