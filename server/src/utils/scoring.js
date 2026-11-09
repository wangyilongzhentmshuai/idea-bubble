/* 确定性评分：标签/主题/关键词三维由后端规则计算，不依赖大模型 */

function bigramSet(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/* 单个标签相似度：相等 1 / 包含 0.7 / 近义按 bigram 比例 */
function labelSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length >= 2 && b.length >= 2) {
    if (a.includes(b) || b.includes(a)) return 0.7;
    const ga = bigramSet(a);
    const gb = bigramSet(b);
    let inter = 0;
    for (const x of ga) if (gb.has(x)) inter++;
    const union = ga.size + gb.size - inter;
    if (union > 0) return 0.6 * (inter / union);
  }
  return 0;
}

function normTags(tags) {
  return (tags || [])
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
}

/* 标签匹配：返回 base 每个标签的最佳命中，以及全局最佳相似度 */
function tagMatch(a, b) {
  const ta = normTags(a.tags);
  const tb = normTags(b.tags);
  if (!ta.length) return { sum: 0, best: 0, count: 0 };
  let sum = 0;
  let best = 0;
  for (const x of ta) {
    let m = 0;
    for (const y of tb) m = Math.max(m, labelSimilarity(x, y));
    sum += m;
    best = Math.max(best, m);
  }
  return { sum, best, count: ta.length };
}

/* 标签分 0-25：base 标签命中率 × 25 */
export function tagScore(a, b) {
  const m = tagMatch(a, b);
  if (!m.count) return 0;
  return Math.round((25 * m.sum) / m.count);
}

/* 主题分 0-15：同罐 15；标签显示同领域给 8；否则 0 */
export function topicScore(a, b) {
  if (a.jarId && b.jarId && a.jarId === b.jarId) return 15;
  return tagMatch(a, b).best >= 0.5 ? 8 : 0;
}

/* 仅保留功能词与语气词，不放业务词，避免误删核心信息 */
const STOP_WORDS = new Set([
  '的','了','是','我','你','他','她','它','在','和','就','都','也','对',
  '嗯','呃','啊','呀','吧','吗','呢','着','过','地','得','之','而','但',
  '把','被','跟','给','到','等','个','能','要','有','让','会','可','又',
  '很','太','最','更','这','那','些','么','谁','啥',
  '我们','你们','他们','这个','那个','可以','就是','然后','还有','觉得',
  '自己','什么','怎么','这样','那样','比较','一点','大概','差不多','需要',
  '相关','根据','通过','以及','目前','已经','还是','不是','没有','一个',
  '一种','进行','并且','或者','如果','因为','所以','为了','对于','关于','其中',
]);

function keywordSegments(text) {
  let t = String(text ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, ' ');
  const words = [...STOP_WORDS].sort((x, y) => y.length - x.length);
  for (const w of words) t = t.split(w).join(' ');
  return t.split(/\s+/).filter((seg) => seg.length >= 2);
}

function contentBigrams(x) {
  const text = [x.title, x.content, ...(x.tags || [])].join(' ');
  const set = new Set();
  for (const seg of keywordSegments(text)) {
    for (let i = 0; i < seg.length - 1; i++) set.add(seg.slice(i, i + 2));
  }
  return set;
}

/* 关键词分 0-10：内容 bigram 命中率，标签强命中给保底 */
export function keywordScore(a, b) {
  const ga = contentBigrams(a);
  const gb = contentBigrams(b);
  let inter = 0;
  for (const x of ga) if (gb.has(x)) inter++;
  const denom = Math.min(ga.size, gb.size);
  let ratio = denom > 0 ? inter / denom : 0;
  if (tagMatch(a, b).best >= 0.5) ratio = Math.max(ratio, 0.5);
  return Math.min(10, Math.round(10 * ratio));
}

export function deterministicScores(base, target) {
  return {
    tag: tagScore(base, target),
    topic: topicScore(base, target),
    keyword: keywordScore(base, target),
  };
}
