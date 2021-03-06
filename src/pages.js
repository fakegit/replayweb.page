"use strict";

import { LitElement, html, css } from 'lit-element';
import { wrapCss } from './misc';
import ndjson from 'fetch-ndjson';

import prettyBytes from 'pretty-bytes';

import FlexSearch from 'flexsearch';
import "keyword-mark-element/lib/keyword-mark.js";

import { getTS } from './pageutils';

import fasSearch from '@fortawesome/fontawesome-free/svgs/solid/search.svg';
import fasAngleDown from '@fortawesome/fontawesome-free/svgs/solid/angle-down.svg';


// ===========================================================================
class Pages extends LitElement
{
  constructor() {
    super();
    this.filteredPages = [];
    this.sortedPages = [];
    this.query = "";
    this.flex = null;
    this.newQuery = null;
    this.loading = false;
    this.updatingSearch = false;

    this.currList = 0;

    this.active = false;
    this.editable = false;
    this.changeNeeded = false;
    
    this.selectedPages = new Set();

    this.menuActive = false;

    this.sortKey = "ts";
    this.sortDesc = true;
  }

  static get sortKeys() {
    return [
      {
        "key": "",
        "name": "Best Match",
      },
      {
        "key": "title",
        "name": "Title"
      },
      {
        "key": "ts",
        "name": "Date"
      }
    ];
  }

  static get properties() {
    return {
      active: { type: Boolean },
      collInfo: { type: Object },
      currList: { type: Number },
      filteredPages: { type: Array },
      sortedPages: { type: Array },

      query: { type: String },

      loading: { type: Boolean },
      updatingSearch: { type: Boolean },
      editable: { type: Boolean },

      selectedPages: { type: Set },
      allSelected: { type: Boolean },

      menuActive: {type: Boolean },

      sortKey: { type: String },
      sortDesc: { type: Boolean }
    }
  }

  _timedUpdate() {
    if (this.newQuery !== null) {
      this.query = this.newQuery;
      this.newQuery = null;
      this.filter();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has("collInfo")) {
      this.updateTextSearch();
    } else if (changedProperties.has("query")) {
      this.filter();

      // default sort to score if has query, otherwise timestamp
      this.sortKey = this.query ? "" : "ts";
      this.sortDesc = this.query ? false : true;

    } else if (changedProperties.has("currList")) {
      this.filter();
    }
    if (changedProperties.has("active") && this.active) {
      if (this.changeNeeded) {
        this.filter();
      }
    }
  }

  onChangeQuery(event) {
    this.newQuery = event.currentTarget.value;
    //this.loading = true;
    if (this._ival) {
      window.clearTimeout(this._ival);
    }
    this._ival = window.setTimeout(() => this._timedUpdate(), 250);
  }

  async filter() {
    if (this.loading) {
      return;
    }
    if (!this.active) {
      this.changeNeeded = true;
    }
    this.loading = true;
    if (this.flex && this.query) {
      const result = await this.flex.search(this.query, {limit: 25});

      this.filteredPages = result;
    } else {
      this.filteredPages = [...this.collInfo.pages];
    }

    if (this.currList !== 0) {
      await this.filterCurated();
    }

    this.loading = false;
    this.changeNeeded = false;
    const data = {query: this.query, currList: this.currList};
    this.sendChangeEvent(data);
  }

  async filterCurated() {
    const resp = await fetch(`${this.collInfo.apiPrefix}/curated/${this.currList}`);
    const json = await resp.json();

    this.sortedPages = [];

    for (const c of json.curated) {
      for (const p of this.filteredPages) {
        if (p.id === c.page) {
          this.sortedPages.push(p);
          break;
        }
      }
    }
  }

  sendChangeEvent(data) {
    this.dispatchEvent(new CustomEvent("coll-tab-nav", {detail: {data}}));
  }

  async updateTextSearch() {
    if (this.updatingSearch) {
      return;
    }

    this.updatingSearch = true;
    let count = 0;

    try {
      const flex = new FlexSearch({
        doc: {
          id: "id",
          field: ["url", "title", "text"],
        },
        async: true
      });

      this.flex = flex;

      const cache = await caches.open("cache:" + this.collInfo.coll);

      const indexUrl = `${this.collInfo.apiPrefix}/textIndex`;

      let resp = await cache.match(indexUrl);

      if (!resp || !Number(resp.headers.get("Content-Length"))) {
        resp = await fetch(`${this.collInfo.apiPrefix}/textIndex`);
        if (resp.status === 200 && Number(resp.headers.get("Content-Length"))) {
          cache.put(indexUrl, resp.clone());
        }
      }

      let lines = [];

      async function flush() {
        let curr = lines;
        lines = [];
        await flex.add(curr);
        console.log("added " + count + " " + curr.length);
        console.log(flex.info());
      }

      for await (const line of ndjson(resp.body.getReader())) {
        if (!line.text) {
          continue;
        }

        line.id = ++count;
        lines.push(line);
        if ((count % 100) === 0) {
          await flush();
        }
      }

      await flush();

    } finally {
      if (count === 0) {
        this.flex.add(this.collInfo.pages);
      }

      this.updatingSearch = false;
    }

    await this.filter();
  }

  static get styles() {
    return wrapCss(css`
      :host {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .main.columns {
        width: 100%;
        justify-self: stretch;
        margin: 1.0em 0 0 0;
        min-height: 0px;
      }

      .header.columns {
        width: 100%;
        margin-bottom: 0px;
      }
      .header a {
        color: black;
      }

      .header .column.pagetitle {
        margin-left: 2.5em;
      }

      .column.main-content {
        min-height: 0px;
        display: flex;
        flex-direction: column;
        padding: 0px;
        margin-top: 0.5em;
        margin-left: 0.75em;
      }

      .sidebar {
        display: flex;
        flex-direction: column;
        border-right: 3px solid rgb(237, 237, 237);
        background-color: whitesmoke;
        padding-right: 0px;
      }

      .sidebar-title {
        font-size: 1.25rem;
        text-transform: uppercase;
        margin-bottom: 1.0rem;
        word-break: break-word;
      }

      .sidebar-status {
        display: flex;
        flex-direction: row;
        margin-bottom: 0.5rem;
        padding-right: 0.75em;
      }

      .sidebar-menu {
        margin-top: 1.0rem;
      }

      #filter-label {
        margin-bottom: 0px;
      }

      .num-results {
        font-style: italic;
        font-weight: normal;
      }

      .asc:after {
        content: "▼";
        font-size: 0.75em;
      }
      .desc:after {
        content: "▲";
        font-size: 0.75em;
      }

      @media screen and (min-width: 768px) {
        .main.columns {
          max-height: 100%;
          height: 100%;
        }
  
        .sidebar-menu {
          max-height: 100%;
          overflow-y: auto;
        }
      }
  
      @media screen and (max-width: 767px) {
        .main.columns {
          position: relative;
          max-height: 100%;
          height: 100%;
        }
  
        .sidebar-menu {
          max-height: 75px;
          overflow-y: auto;
          margin-top: 0.75em;
        }
  
        .column.main-content {
          position: relative;
          overflow-y: auto;
  
          border-top: 1px solid black;
          width: 100%;
          min-height: 0px;
          height: 100%;
          padding: 0px;
          margin: 0px;
        }

        .mobile-header {
          margin: 0.5rem;
          margin-left: 1.0rem;
          display: flex;
          justify-content: space-between;
          flex-direction: row;
          min-height: 24px;
          width: 100%;
        }

        .menu {
          font-size: 0.80rem;
        }
      }

      .scroller {
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        flex: auto;

        padding-bottom: 1.0em;
        min-height: 0px;
      }
      .selected {
        background-color: ghostwhite;
      }

      .page-header {
        display: flex;
        flex-direction: row;
        width: 100%;
        min-height: fit-content;

        margin-bottom: 1.0em;
        border-bottom: 3px solid rgb(237, 237, 237);
      }

      .check-select {
        padding-right: 1.0em;
      }

      .search-bar {
        width: 100%;
        display: flex;
        flex-direction: row;
      }
      .flex-auto {
        flex: auto;
      }
    `);
  }

  onSelectList(event) {
    event.preventDefault();
    this.currList = Number(event.currentTarget.getAttribute("data-list"));
  }

  render() {
    const currList = this.currList;

    return html`
    <div class="search-bar notification is-marginless">
      <div class="field flex-auto">
        <div class="control has-icons-left ${this.loading ? 'is-loading' : ''}">
          <input type="text" class="input" @input="${this.onChangeQuery}" .value="${this.query}" type="text"
          placeholder="Search by Page URL, Title or Text">
          <span class="icon is-left"><fa-icon .svg="${fasSearch}"/></span>
        </div>
      </div>
    </div>

    <div class="main columns">
      <div class="column sidebar is-one-fifth is-hidden-mobile">
        <div class="sidebar-title">${this.collInfo.title}</div>

        <span class="num-results">${this.formatResults()}</span>

        ${this.editable ? html`
        <div class="sidebar-actions">
          ${this.renderDownloadMenu()}
        </div>` : ``}

        ${this.collInfo.lists.length ? html`
        <p id="filter-label" class="menu-label">Filter By List:</p>
        <aside class="sidebar-menu menu">
          <ul class="menu-list">
            <li>
              <a href="#list-0" data-list="0" class="${currList === 0 ? 'is-active' : ''}"
                @click=${this.onSelectList}><i>All Pages</i></a>
            </li>
            ${this.collInfo.lists.map(list => html`
              <li>
                <a @click=${this.onSelectList} href="#list-${list.id}"
                data-list="${list.id}" 
                class="${currList === list.id ? 'is-active' : ''}">${list.title}</a>
              </li>`)}
          </ul>
        </aside>
        ` : ``}
      </div>
      <div class="column main-content">
        ${this.renderPages()}
      </div>
    </div>`;
  }

  renderDownloadMenu() {
    return html`
      <div class="dropdown ${this.menuActive ? 'is-active' : ''}">
        <div class="dropdown-trigger">
          <button @click="${this.onMenu}" class="button is-small" aria-haspopup="true" aria-controls="dropdown-menu">
            <span>Download</span>
            <span class="icon is-small">
              <fa-icon .svg="${fasAngleDown}"/>
            </span>
          </button>
        </div>
        <div class="dropdown-menu" id="dropdown-menu" role="menu">
          <div class="dropdown-content">
            <a @click="${(e) => this.onDownload(e, "wacz", true)}" class="dropdown-item">
              Download Selected as WACZ (Web Archive Collection)
            </a>
            <a @click="${(e) => this.onDownload(e, "warc", true)}" class="dropdown-item">
              Download Selected as WARC Only
            </a>
            <hr class="dropdown-divider">
            <a @click="${(e) => this.onDownload(e, "wacz", false)}" class="dropdown-item">
              Download All as WACZ (Web Archive Collection)
            </a>
            <a @click="${(e) => this.onDownload(e, "warc", false)}" class="dropdown-item">
              Download All as WARC Only
            </a>
          </div>
        </div>
      </div>`;
  }

  renderPageHeader() {
    return html`
    ${this.editable ? html`
    <div class="check-select">
      <label class="checkbox">
      <input @change=${this.onSelectAll} type="checkbox" .checked="${this.allSelected}">
      </label>
    </div>` : html``}

    <div class="header columns is-hidden-mobile">
      ${this.query ? html`
      <a @click="${this.onSort}" data-key="" class="column is-1 ${this.sortKey === "" ? (this.sortDesc ? "desc" : "asc") : ''}">Match</a>` : ``}

      <a @click="${this.onSort}" data-key="ts" class="column is-2 ${this.sortKey === "ts" ? (this.sortDesc ? "desc" : "asc") : ''}">Date</a>
      <a @click="${this.onSort}" data-key="title" class="column is-6 pagetitle ${this.sortKey === "title" ? (this.sortDesc ? "desc" : "asc") : ''}">Page Title</a>
    </div>

    <div class="is-hidden-tablet mobile-header">
      <span class="num-results">${this.formatResults()}</span>
      <wr-sorter id="pages"
      .sortKey="${this.sortKey}"
      .sortDesc="${this.sortDesc}"
      .sortKeys="${Pages.sortKeys}"
      .data="${this.filteredPages}"
      @sort-changed="${this.onSortChanged}"
      class="${this.filteredPages.length ? '' : 'is-hidden'}">
      </wr-sorter>
    </div>
    `;
  }

  renderPages() {
    //const name = this.currList === 0 ? "All Pages" : this.collInfo.lists[this.currList - 1].title;
    return html`
      <div class="page-header has-text-weight-bold">
      ${this.renderPageHeader()}
      </div>
      <div class="scroller" @scroll="${this.onScroll}">
        ${this.sortedPages.length ? html`
          ${this.sortedPages.map((p, i) => html`
          <div class="content ${this.selectedPages.has(p.id) ? 'selected' : ''}">
            <wr-page-entry .index="${this.query ? (this.sortDesc ? this.sortedPages.length - i : i + 1) : 0}" .editable="${this.editable}" .selected="${this.selectedPages.has(p.id)}" @sel-page="${this.onSelectToggle}" @delete-page="${this.onDeletePage}" replayPrefix="${this.collInfo.replayPrefix}" query="${this.query}" .page="${p}">
            </wr-page-entry>
          </div>`)}` : html`<p class="mobile-header">${this.getNoResultsMessage()}</p>`}
      </div>
    `;
  }

  onMenu(event) {
    event.stopPropagation();
    this.menuActive = !this.menuActive;

    if (this.menuActive) {
      document.addEventListener("click", () => {
        this.menuActive = false;
      }, {once: true});
    }
  }

  onSort(event) {
    event.preventDefault();

    const key = event.currentTarget.getAttribute("data-key") || "";
    if (key === this.sortKey) {
      this.sortDesc = !this.sortDesc;
    } else {
      this.sortDesc = false;
      this.sortKey = key;
    }
  }

  onSortChanged(event) {
    this.sortedPages = event.detail.sortedData;
    this.sortKey = event.detail.sortKey;
    this.sortDesc = event.detail.sortDesc;
  }

  onSelectToggle(event) {
    const {page, selected} = event.detail;
    if (selected) {
      this.selectedPages.add(page);
    } else {
      this.selectedPages.delete(page);
    }
    this.allSelected = (this.selectedPages.size === this.sortedPages.length);
    this.requestUpdate();
  }

  onSelectAll(event) {
    this.allSelected = event.currentTarget.checked;
    if (!this.allSelected) {
      this.selectedPages.clear();
    } else {
      //this.selectedPages = new Set();
      this.sortedPages.forEach(p => {
        this.selectedPages.add(p.id);
      });
    }
    //this.allSelected = (this.selectedPages.size === this.sortedPages.length);
    this.requestUpdate();
  }

  async onDownload(event, format, selected) {
    event.preventDefault();

    const params = new URLSearchParams();
    params.set("pages", selected ? Array.from(this.selectedPages.keys()).join(",") : "all");
    params.set("format", format);
    if (this.collInfo.filename) {
      params.set("filename", this.collInfo.filename);
    }

    window.location.href = `${this.collInfo.apiPrefix}/dl?` + params.toString();
  }

  async onDeletePage(event) {
    const page = event.currentTarget.page;
    const resp = await fetch(`${this.collInfo.apiPrefix}/page/${page.id}`, {method: 'DELETE'});
    const json = await resp.json();

    const inx = this.collInfo.pages.indexOf(page);
    if (inx < 0) {
      return;
    }

    //todo: full update?
    this.collInfo.pages.splice(inx, 1);
    //if (!this.query){
    //  this.filteredPages = [...this.collInfo.pages];
    //}

    this.updateTextSearch();
    this.requestUpdate();
  }

  formatResults() {
    if (this.sortedPages.length === 1) {
      return "1 Page Found";
    } else {
      return `${this.sortedPages.length} Pages Found`;
    }
  }

  getNoResultsMessage() {
    if (!this.collInfo || !this.collInfo.pages.length) {
      return html`No Pages defined this archive. Check out&nbsp;<a href="#view=resources">Page Resources</a>&nbsp;to search by URL.`;
    }

    if (this.updatingSearch) {
      return "Initializing Search..."
    }

    if (this.loading) {
      return "Searching...";
    }

    if (!this.query) {
      return "No Pages Found. Try changing the search query.";
    }

    return "No Pages Found";
  }

  onScroll(event) {
    const element = event.currentTarget;
    const diff = (element.scrollHeight - element.scrollTop) - element.clientHeight;
    if (diff < 40) {
      const sorter = this.renderRoot.querySelector("wr-sorter");
      if (sorter) {
        sorter.getMore();
      }
    }
  }
}

// ===========================================================================
class PageEntry extends LitElement
{
  constructor() {
    super();
    this.query = "";
    this.textSnippet = "";
    this.page = null;
    this.replayPrefix = "";
    this.deleting = false;
    this.editable = false;
    this.iconValid = false;
    this.index = 0;
  }

  static get properties() {
    return {
      query: { type: String },
      textSnippet: { type: String },
      page: { type: Object },
      replayPrefix: { type: String },
      deleting: { type: Boolean },
      selected: { type: Boolean },
      editable: { type: Boolean },
      iconValid: { type: Boolean },
      index: { type: Number },
    }
  }

  static get styles() {
    return wrapCss(css`
      :host {
        min-height: min-content;
        width: 100%;
        word-break: break-all;
        position: relative;
        display: flex;
        flex-direction: row;
        background: transparent;
      }

      .check-select {
        padding-right: 1.0em;
        height: 100%;
        margin: auto 0 auto 0;
      }

      .columns {
        width: 100%;
      }

      .favicon {
        width: 24px !important;
        height: 24px !important;
        display: inline-block;
        vertical-align: text-bottom;
      }
      img.favicon {
        filter: drop-shadow(1px 1px 2px grey);
      }

      .media-left {
        align-self: center;
      }

      .delete {
        position: absolute;
        top: 8px;
        right: 8px;
      }

      .delete:hover {
        background-color: rgb(241, 70, 104);
      }

      @media screen and (max-width: 767px) {
        .col-date {
          margin-left: calc(24px + 1rem);
        }
        .col-date div {
          display: inline;
        }
        .col-index {
          position: absolute;
          top: 0px;
          left: 0px;
          margin-top: -0.75em;
        }
        .columns {
          display: flex;
          flex-direction: column-reverse;
        }
      }
    `);
  }

  updated(changedProperties) {
    if (changedProperties.has("page") || changedProperties.has("query")) {
      this.updateSnippet();
      this.iconValid = !!this.page.favIconUrl;
      //this.updateFavIcon();
      this.deleting = false;
    }
  }

  getDateTS() {
    let date = null;
    let ts = this.page.ts;
    try {
      date = new Date(this.page.ts || this.page.date);
    } catch (e) { 

    }

    const timestamp = (date && !isNaN(date)) ? getTS(date.toISOString()) : "";
    return {date, timestamp};
  }

  render() {
    const p = this.page;
    const {date, timestamp} = this.getDateTS();

    const hasSize = typeof(p.size) === "number";

    return html`
    ${this.editable ? html`
    <div class="check-select">
      <label class="checkbox">
      <input @change=${this.onSendSelToggle} type="checkbox" .checked="${this.selected}">
      </label>
    </div>` : ``}

    <div class="columns">
      ${this.index ? html`
      <div class="column col-index is-1">${this.index}.</div>
      ` : ``}
      <div class="column col-date is-2">
        <div>${date ? date.toLocaleDateString() : ""}</div>
        <div>${date ? date.toLocaleTimeString() : ""}</div>
      </div>
      <div class="column">
        <article class="media">
          <figure class="media-left">
            <p class="">
            ${this.iconValid ? html`
              <img class="favicon" @error="${(e) => this.iconValid = false}" src="${this.replayPrefix}/${timestamp}id_/${p.favIconUrl}"/>` : html`
              <span class="favicon"></span>`}
            </p>
          </figure>
          <div class="media-content">
            <a @click="${this.onReplay}" data-url="${p.url}" data-ts="${timestamp}" href="#">
              <p class="is-size-6 has-text-weight-bold has-text-link text">
              <keyword-mark keywords="${this.query}">${p.title || p.url}</keyword-mark>
              </p>
              <p class="has-text-dark text"><keyword-mark keywords="${this.query}">${p.url}</keyword-mark></p>
            </a>
            ${this.textSnippet ? html`
              <div class="text"><keyword-mark keywords="${this.query}">${this.textSnippet}</keyword-mark></div>` : html``}
          </div>
          ${hasSize ? html`
          <div class="media-right" style="margin-right: 2em">
            ${prettyBytes(p.size)}
          </div>` : ``}
        </article>
      </div>
    </div>
    
    ${this.editable ? html`
      ${!this.deleting ? html`
      <button @click="${this.onSendDeletePage}" class="delete"></button>` : html`
      <button class="button delete is-loading is-static"></button>
      `}` : ''}
    `;
  }

  async updateFavIcon() {
    if (!this.page.favIconUrl)  {
      this.favIconData = null;
      return;
    }

    const {timestamp} = this.getDateTS();

    const resp = await fetch(`${this.replayPrefix}/${timestamp}id_/${this.page.favIconUrl}`);

    if (resp.status != 200) {
      this.favIconData = null;
      return;
    }

    const payload = await resp.arrayBuffer();
    const mime = resp.headers.get("content-type");

    try {
      this.favIconData = `data:${mime};base64,${btoa(String.fromCharCode.apply(null, payload))}`;
    } catch (e) {
      console.log(e);
      this.favIconData = null;
    }
  }

  updateSnippet() {
    const oldVal = this.textSnippet;

    if (!this.query || !this.page.text) {
      this.textSnippet = null;
      this.requestUpdate('textSnippet', oldVal);
      return;
    }

    let textContent = this.page.text;
    let query = this.query;

    let inx = textContent.indexOf(this.query);

    if (inx < 0) {
      let textLower = textContent.toLowerCase();
      let queryLower = query.toLowerCase();

      inx = textLower.indexOf(queryLower);

      if (inx < 0) {
        this.textSnippet = null;
        this.requestUpdate('textSnippet', oldVal);
        return;
      }

      textContent = textLower;
      query = queryLower;
    }

    let lastInx = textContent.lastIndexOf(query);

    inx = Math.max(inx - 100, 0);
    lastInx = Math.min(lastInx + 200, textContent.length);

    if (inx === 0 && lastInx === textContent.length) {
      this.textSnippet = textContent;
    } else {
      this.textSnippet = "..." + textContent.slice(inx, lastInx) + "...";
    }

    this.requestUpdate('textSnippet', oldVal);
  }

  onReplay(event) {
    event.preventDefault();
    const data = {
      url: event.currentTarget.getAttribute("data-url"),
      ts: event.currentTarget.getAttribute("data-ts"),
      view: "replay"
    };
    this.sendChangeEvent(data);
    return false;
  }

  sendChangeEvent(data) {
    this.dispatchEvent(new CustomEvent("coll-tab-nav", {bubbles: true, composed: true, detail: {data}}));
  }

  onSendDeletePage(event) {
    const page = this.page.id;
    this.deleting = true;
    this.dispatchEvent(new CustomEvent("delete-page", {detail: {page}}));
  }

  onSendSelToggle(event) {
    const page = this.page.id;
    const selected = event.currentTarget.checked;
    this.dispatchEvent(new CustomEvent("sel-page", {detail: {page, selected}}));
  }
}

customElements.define("wr-page-view", Pages);
customElements.define("wr-page-entry", PageEntry);

export { Pages, PageEntry };
