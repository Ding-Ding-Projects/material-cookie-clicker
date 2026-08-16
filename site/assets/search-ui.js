import { ARTICLES, search } from './search.js';

const input = document.getElementById('q');
const regexToggle = document.getElementById('regex-mode');
const status = document.getElementById('search-status');
const list = document.getElementById('search-results');

function render() {
  const outcome = search(input.value, regexToggle.checked);
  list.replaceChildren();
  if (outcome.empty) {
    status.textContent = 'Type to search ' + ARTICLES.length + ' articles.';
    return;
  }
  if (!outcome.ok) {
    status.textContent = outcome.error;
    return;
  }
  const count = outcome.results.length;
  status.textContent = count === 1 ? '1 article matches.' : count + ' articles match.';
  for (const result of outcome.results) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = result.article.u;
    a.textContent = result.article.t;
    const p = document.createElement('p');
    p.textContent = result.snippet;
    li.append(a, p);
    list.append(li);
  }
}

input.addEventListener('input', render);
regexToggle.addEventListener('change', render);
render();
