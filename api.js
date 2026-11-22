
const SEEKeeAPI = (() => {
  const ARCHIVE = 'https://archive.org';
  const PEERTUBE = 'https://peertube.tv';

  const FILTERS = {
    all: 'mediatype:movies',
    movies: 'mediatype:movies',
    series: 'mediatype:movies',
    shorts: 'mediatype:movies',
    anime: 'mediatype:movies',
    documentary: 'mediatype:movies'
  };

  const isSpanish = value =>
    /^(spa|es|spanish|espanol|español)([-_ ]|$)/i.test(
      typeof value === 'object'
        ? String(value?.id || value?.label || '')
        : String(value || '').trim()
    );

  async function searchArchive(query, category, page) {
    const terms = query.trim().replace(/[()"]/g, ' ');
    const filter = FILTERS[category] || FILTERS.all;
    const q = `${filter} AND language:spa` +
      (terms ? ` AND title:(${terms})` : '');

    const url = ARCHIVE + '/advancedsearch.php?q=' +
      encodeURIComponent(q) +
      '&fl[]=identifier&fl[]=title&fl[]=description&fl[]=language' +
      '&rows=20&page=' + encodeURIComponent(String(page)) + '&output=json';

    const response = await fetch(url);
    if (!response.ok) throw new Error('Internet Archive HTTP ' + response.status);

    const data = await response.json();
    return (data.response?.docs || []).filter(item => {
      const langs = Array.isArray(item.language)
        ? item.language : [item.language];
      return langs.some(isSpanish);
    }).map(item => ({
      id: item.identifier,
      title: item.title || item.identifier,
      description: Array.isArray(item.description)
        ? item.description.join(' ')
        : (item.description || ''),
      poster: `${ARCHIVE}/services/img/${encodeURIComponent(item.identifier)}`,
      source: 'Internet Archive'
    }));
  }

  async function searchPeerTube(query) {
    if (!query.trim()) return [];

    const url = PEERTUBE + '/api/v1/search/videos?search=' +
      encodeURIComponent(query.trim()) + '&count=20&sort=-match';

    const response = await fetch(url);
    if (!response.ok) throw new Error('PeerTube HTTP ' + response.status);

    const data = await response.json();
    return (data.data || []).filter(item =>
      isSpanish(item.language)
    ).map(item => {
      let host = PEERTUBE;
      try {
        if (item.url) host = new URL(item.url).origin;
      } catch {}

      return {
        id: `pt|${host}|${item.uuid || item.id}`,
        title: item.name || 'Video',
        description: item.description || '',
        poster: item.thumbnailPath
          ? (item.thumbnailPath.startsWith('http')
              ? item.thumbnailPath : host + item.thumbnailPath)
          : '',
        source: 'PeerTube'
      };
    });
  }

  async function search(query = '', category = 'all', page = 1) {
    const sources = await Promise.allSettled([
      searchArchive(query, category, page),
      searchPeerTube(query)
    ]);

    const results = [];
    for (const source of sources) {
      if (source.status === 'fulfilled') results.push(...source.value);
    }

    const seen = new Set();
    return results.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  async function files(identifier) {
    if (String(identifier).startsWith('pt|')) {
      const parts = String(identifier).split('|');
      const host = parts[1];
      const videoId = parts.slice(2).join('|');

      const response = await fetch(
        `${host}/api/v1/videos/${encodeURIComponent(videoId)}`
      );
      if (!response.ok) throw new Error('No se pudo consultar el video PeerTube');

      const data = await response.json();
      if (!isSpanish(data.language)) return [];

      return (data.files || [])
        .filter(file =>
          file.fileUrl &&
          /^https?:\/\//i.test(file.fileUrl) &&
          file.hasAudio === true &&
          file.hasVideo === true &&
          /\.mp4(?:[?#]|$)/i.test(file.fileUrl)
        )
        .map(file => ({
          name: file.resolution?.label || data.name || 'Video MP4',
          url: file.fileUrl,
          language: data.language?.id || 'es'
        }));
    }

    const response = await fetch(
      `${ARCHIVE}/metadata/${encodeURIComponent(identifier)}`
    );
    if (!response.ok) throw new Error('No se pudieron consultar los archivos');

    const data = await response.json();
    const langs = Array.isArray(data.metadata?.language)
      ? data.metadata.language : [data.metadata?.language];

    if (!langs.some(isSpanish)) return [];

    return (data.files || [])
      .filter(file =>
        file.name && /\.(mp4|webm|ogv|m4v)$/i.test(file.name)
      )
      .map(file => ({
        name: file.name,
        url: `${ARCHIVE}/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`,
        language: 'spa'
      }));
  }

  return Object.freeze({ search, files });
})();

window.SEEKeeAPI = SEEKeeAPI;
      
