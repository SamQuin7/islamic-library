const categoriesListEl = document.getElementById("categories-list");
const searchInputEl = document.getElementById("search-input");
const articleContainerEl = document.getElementById("article-container");
const searchResultsEl = document.getElementById("search-results");
const themeToggleBtn = document.getElementById("theme-toggle");
const heroButtons = document.querySelectorAll("[data-target]");

let categories = [];
let articlesByCategory = {};
let allArticles = [];
let fuse;
let currentCategoryId = null;

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const highlightIndices = (value, indices) => {
  if (!indices?.length) {
    return escapeHtml(value);
  }

  let cursor = 0;
  let highlighted = "";

  indices.forEach(([start, end]) => {
    highlighted += escapeHtml(value.slice(cursor, start));
    highlighted += `<mark>${escapeHtml(value.slice(start, end + 1))}</mark>`;
    cursor = end + 1;
  });

  highlighted += escapeHtml(value.slice(cursor));
  return highlighted;
};

const fetchJSON = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load ${path}`);
  }

  return response.json();
};

const setTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "🌙" : "☀️";
  localStorage.setItem("site-theme", theme);
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
};

const renderCategories = () => {
  categoriesListEl.innerHTML = categories
    .map(
      (category) => `
      <button class="category-card" data-category="${category.id}" type="button">
        <h3>${category.name}</h3>
        <p>${category.description}</p>
        <span class="category-meta">${category.count ?? 0} titles</span>
      </button>
    `
    )
    .join("");
};

const setActiveCategory = (categoryId) => {
  currentCategoryId = categoryId;
  categoriesListEl
    .querySelectorAll(".category-card")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.category === categoryId
      );
    });
};

const buildArticleList = (articles) => {
  if (!articles.length) {
    articleContainerEl.innerHTML = `
      <div class="placeholder-card">
        <h3>Work in progress</h3>
        <p>More articles will appear here as soon as they are added.</p>
      </div>
    `;
    return;
  }

  articleContainerEl.innerHTML = `
    <div class="article-list" id="article-list">
      ${articles
        .map(
          (article) => `
            <article class="article-card" data-article="${article.id ?? article.title}">
              <h3>${article.title}</h3>
              <p>${article.summary}</p>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="article-detail" id="article-detail">
      <p class="placeholder-card">Select a title to open the detail view.</p>
    </div>
  `;

  const articleListEl = document.getElementById("article-list");
  articleListEl.addEventListener("click", (event) => {
    const card = event.target.closest("[data-article]");
    if (!card) return;
    const articleId = card.dataset.article;
    const clicked = articles.find(
      (article) => article.id === articleId || article.title === articleId
    );
    if (clicked) {
      renderArticleDetail(clicked);
    }
  });
};

const renderArticleDetail = (article) => {
  const detailEl = document.getElementById("article-detail");
  if (!detailEl) {
    return;
  }

  const tags = article.tags
    ?.map((tag) => `<span>${tag}</span>`)
    .join("") ?? "";

  const references =
    article.references?.length
      ? `
        <div class="references">
          <h4>References</h4>
          <ul>
            ${article.references
              .map(
                (reference) => `
                  <li>
                    ${reference.url ? `<a href="${reference.url}" target="_blank" rel="noreferrer">${reference.label}</a>` : reference.label}
                    ${reference.detail ? `<span>– ${reference.detail}</span>` : ""}
                  </li>
                `
              )
              .join("")}
          </ul>
        </div>
      `
      : "";

  const images = article.images
    ?.map(
      (image) => `<img src="${image}" alt="${article.title} illustration" loading="lazy" />`
    )
    .join("") ?? "";

  detailEl.innerHTML = `
    <h2>${article.title}</h2>
    <div class="meta">
      <span>${article.categoryName}</span>
      ${tags}
    </div>
    <p>${article.summary}</p>
    ${images}
    <article>${article.content}</article>
    ${references}
  `;
  detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
};

const displayArticlesForCategory = (categoryId) => {
  setActiveCategory(categoryId);
  const articles = articlesByCategory[categoryId] ?? [];
  buildArticleList(articles);
  if (articles.length) {
    renderArticleDetail(articles[0]);
  }
  searchResultsEl.classList.remove("visible");
};

const scrollToCategory = (categoryId) => {
  const target = categoriesListEl.querySelector(
    `[data-category="${categoryId}"]`
  );
  if (!target) return;
  target.click();
  target.scrollIntoView({ behavior: "smooth", block: "center" });
};

const createResultSnippet = (article, matches) => {
  if (!matches?.length) {
    return `${escapeHtml(article.summary ?? "").slice(0, 180)}${
      article.summary && article.summary.length > 180 ? "…" : ""
    }`;
  }

  const match = matches[0];
  return highlightIndices(match.value, match.indices);
};

const renderSearchResults = (results) => {
  if (!results.length) {
    searchResultsEl.innerHTML = "<p>No results found.</p>";
    searchResultsEl.classList.add("visible");
    return;
  }

  searchResultsEl.innerHTML = `
    <div class="search-results__header">
      <h4>Search results (${results.length})</h4>
      <p>Tap a result to open the full article.</p>
    </div>
    ${results
      .map(
        (result) => {
          const article = result.item;
          const snippet = createResultSnippet(article, result.matches);
          return `
            <button type="button" class="search-result-card" data-article="${
              article.id ?? article.title
            }">
              <strong>${article.title}</strong>
              <em>${article.categoryName}</em>
              <p>${snippet}</p>
            </button>
          `;
        }
      )
      .join("")}
  `;
  searchResultsEl.classList.add("visible");
};

const handleSearchClick = (event) => {
  const card = event.target.closest("[data-article]");
  if (!card) return;
  const articleId = card.dataset.article;
  const match =
    allArticles.find(
      (article) => article.id === articleId || article.title === articleId
    ) ?? null;
  if (match) {
    if (match.categoryId) {
      setActiveCategory(match.categoryId);
      const categoryArticles = articlesByCategory[match.categoryId] ?? [];
      buildArticleList(categoryArticles);
    }
    renderArticleDetail(match);
  }
};

const handleSearch = () => {
  const query = searchInputEl.value.trim();
  if (!query) {
    searchResultsEl.classList.remove("visible");
    return;
  }

  const results = fuse?.search(query) ?? [];
  renderSearchResults(results);
};

const setupFuse = () => {
  fuse = new Fuse(allArticles, {
    includeMatches: true,
    threshold: 0.35,
    ignoreLocation: true,
    keys: ["title", "summary", "content"],
  });
};

const init = async () => {
  const savedTheme = localStorage.getItem("site-theme");
  const defaultTheme =
    savedTheme ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(defaultTheme);

  themeToggleBtn.addEventListener("click", toggleTheme);
  categoriesListEl.addEventListener("click", (event) => {
    const categoryButton = event.target.closest("[data-category]");
    if (!categoryButton) return;
    const categoryId = categoryButton.dataset.category;
    displayArticlesForCategory(categoryId);
  });
  searchResultsEl.addEventListener("click", handleSearchClick);
  searchInputEl.addEventListener("input", handleSearch);

  heroButtons.forEach((button) =>
    button.addEventListener("click", () =>
      scrollToCategory(button.dataset.target)
    )
  );

  try {
    categories = await fetchJSON("data/categories.json");
    await Promise.all(
      categories.map(async (category) => {
        const articles = await fetchJSON(`data/${category.id}/articles.json`);
        articlesByCategory[category.id] = articles.map((article) => ({
          ...article,
          categoryId: category.id,
          categoryName: category.name,
        }));
        category.count = articles.length;
      })
    );

    allArticles = Object.values(articlesByCategory).flat();
    renderCategories();
    setupFuse();
    if (categories.length) {
      displayArticlesForCategory(categories[0].id);
    }
  } catch (error) {
    articleContainerEl.innerHTML = `
      <div class="placeholder-card">
        <h3>Error loading library</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
};

init();

