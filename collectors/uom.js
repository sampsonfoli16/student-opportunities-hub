const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://www.uom.ac.mu';
const PAGE_URL = BASE + '/index.php/employment-opportunity';
const SOURCE = 'UoM Employment Opportunity';
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const URL_RE = /\s*(https?:\/\/\S+|www\.\S+)/i;

function parseDate(text) {
  const m = (text || '').trim().match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Date.UTC(+m[3], month, +m[1])).toISOString().slice(0, 10);
}

function decode(value) {
  return Buffer.from((value || '').replace(/\s+/g, ''), 'base64').toString('utf8');
}

function decodeEmail($el) {
  if (!$el.length) return null;
  const first = decode($el.attr('first'));
  const last = decode($el.attr('last'));
  return first && last ? first + '@' + last : null;
}

const clean = s =>
  (s || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/>>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*>+$/, '')
    .trim();

function classify(title) {
  return /\b(intern(ship)?s?|trainee(ship)?s?|stagiaires?|attachment|apprentice(ship)?s?)\b/i.test(title)
    ? 'internship'
    : 'job';
}

function parse(html) {
  const $ = cheerio.load(html);
  const items = [];
  let lastDate = null;

  $('tr').each((_, tr) => {
    const $tr = $(tr);
    const dateCell = $tr.find('td[data-th^="Date"]');
    const companyCell = $tr.find('td[data-th^="COMPANY"]');
    const jobCell = $tr.find('td[data-th^="JOB"]');
    const detailsCell = $tr.find('td[data-th^="REQ"]');

    const parsedDate = parseDate(dateCell.text());
    if (parsedDate) lastDate = parsedDate;

    const link = jobCell.find('a').first();
    if (!jobCell.length || !link.length) return;
    const href = link.attr('href');
    if (!href) return;

    // Organisation: remove links, then strip any plain-text website
    const orgCell = companyCell.clone();
    orgCell.find('a, em').remove();
    let orgText = clean(orgCell.text());
    const urlMatch = orgText.match(URL_RE);
    let website = companyCell.find('a').first().attr('href') || (urlMatch ? urlMatch[1] : null);
    if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
    const organisation = clean(orgText.replace(URL_RE, ''));

    // Title: strip numbering, replace empty or generic titles
    let title = clean(link.text()).replace(/^\d+\.\s*/, '');
    const type = classify(title);
    if (!title || /^\d+$/.test(title) || /^job opportunity$/i.test(title)) {
      title = 'Opportunity at ' + organisation;
    }

    const eligibility = jobCell
      .find('li')
      .map((_, li) => clean($(li).text()))
      .get()
      .join('; ');

    const fullLink = new URL(href, BASE).href;

    items.push({
      id: crypto.createHash('sha1').update(fullLink + '|' + title).digest('hex').slice(0, 16),
      title,
      organisation,
      type,
      posted: parsedDate || lastDate,
      deadline: null,
      eligibility,
      location: 'Mauritius',
      link: fullLink,
      company_website: website,
      apply_email: decodeEmail(detailsCell.find('joomla-hidden-mail').first()),
      source: SOURCE,
      source_url: PAGE_URL,
    });
  });

  return items;
}

async function main() {
  let html;
  if (process.argv.includes('--live')) {
    const res = await axios.get(PAGE_URL, {
      headers: { 'User-Agent': 'StudentOpportunitiesHub/0.1 (student project)' },
    });
    html = res.data;
  } else {
    html = fs.readFileSync('data/page.html', 'utf8');
  }

  const items = parse(html);
  console.table(
    items.map(({ posted, organisation, type, title }) => ({ posted, organisation, type, title }))
  );
  const nInternships = items.filter(i => i.type === 'internship').length;
  fs.writeFileSync('data/uom.json', JSON.stringify(items, null, 2));
  console.log(
    '\n' + items.length + ' opportunities found (' + nInternships + ' internships/trainee posts). Saved to data/uom.json'
  );
}

if (require.main === module) {
  main().catch(err => console.error('Error:', err.message));
}

module.exports = { parse };
