function mapBubble(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags),
    status: row.status,
    source: row.source,
    x: row.x,
    y: row.y,
    color: row.color,
    jarId: row.jar_id,
    recordingId: row.recording_id,
    origin: row.origin,
    unclassified: row.unclassified === 1,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJar(row) {
  if (!row) return null;
  return {
    id: row.id,
    theme: row.theme,
    themeColor: row.theme_color,
    createdAt: row.created_at,
  };
}

function mapRecording(row) {
  if (!row) return null;
  return {
    id: row.id,
    audioPath: row.audio_path,
    duration: row.duration,
    mime: row.mime,
    transcript: row.transcript,
    status: row.status,
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

export function createRepository(db) {
  const stmts = {
    listBubbles: db.prepare(
      `SELECT * FROM bubbles
       WHERE (? IS NULL OR status = ?)
       ORDER BY created_at ASC, rowid ASC`
    ),
    getBubble: db.prepare(`SELECT * FROM bubbles WHERE id = ?`),
    listJars: db.prepare(`SELECT * FROM jars ORDER BY created_at ASC, rowid ASC`),
    countJarBubbles: db.prepare(
      `SELECT COUNT(*) AS n FROM bubbles WHERE jar_id = ? AND status = 'archived'`
    ),
    getJar: db.prepare(`SELECT * FROM jars WHERE id = ?`),
    listJarBubbles: db.prepare(
      `SELECT * FROM bubbles WHERE jar_id = ? ORDER BY created_at ASC, rowid ASC`
    ),
    addRecording: db.prepare(`
      INSERT INTO recordings(
        id, audio_path, duration, mime, transcript, status, error_code, created_at
      ) VALUES (
        @id, @audio_path, @duration, @mime, @transcript, @status, @error_code, @created_at
      )
    `),
    updateRecording: db.prepare(`
      UPDATE recordings
      SET transcript = ?, status = ?, error_code = ?
      WHERE id = ?
    `),
    failRecording: db.prepare(`
      UPDATE recordings
      SET status = 'failed', error_code = ?
      WHERE id = ?
    `),
    addBubble: db.prepare(`
      INSERT INTO bubbles(
        id, title, content, tags, status, source, x, y, color,
        jar_id, recording_id, origin, unclassified, schema_version, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `),
    countBubbles: db.prepare(`SELECT COUNT(*) AS n FROM bubbles`),
    getRecording: db.prepare(`SELECT * FROM recordings WHERE id = ?`),
    addJar: db.prepare(`
      INSERT INTO jars(id, theme, theme_color, created_at)
      VALUES (?, ?, ?, ?)
    `),
    markUnclassified: db.prepare(`
      UPDATE bubbles SET unclassified = 1, updated_at = ? WHERE id = ?
    `),
    archiveBubble: db.prepare(`
      UPDATE bubbles
      SET status = 'archived', jar_id = ?, unclassified = 0, updated_at = ?
      WHERE id = ?
    `),
    markBubbleArchived: db.prepare(`
      UPDATE bubbles SET status = 'archived', updated_at = ? WHERE id = ?
    `),
    addScore: db.prepare(`
      INSERT INTO association_scores(
        id, base_bubble_id, target_bubble_id, semantic, tag_score,
        topic_score, keyword_score, total, passed, reason, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `),
    addFusionRecord: db.prepare(`
      INSERT INTO fusion_records(id, result_bubble_id, participant_ids, created_at)
      VALUES (?, ?, ?, ?)
    `),
    deleteBubble: db.prepare(`DELETE FROM bubbles WHERE id = ?`),
    deleteJar: db.prepare(`DELETE FROM jars WHERE id = ?`),
  };

  return {
    async listBubbles(status) {
      const rows = stmts.listBubbles.all(status ?? null, status ?? null);
      return rows.map(mapBubble);
    },

    async getBubble(id) {
      return mapBubble(stmts.getBubble.get(id));
    },

    async listJars() {
      return stmts.listJars.all().map((row) => ({
        ...mapJar(row),
        count: stmts.countJarBubbles.get(row.id).n,
      }));
    },

    async getJar(id) {
      const jar = mapJar(stmts.getJar.get(id));
      if (!jar) return null;
      const bubbles = stmts.listJarBubbles.all(id).map(mapBubble);
      return { ...jar, bubbles };
    },

    async addRecording(rec) {
      stmts.addRecording.run({
        id: rec.id,
        audio_path: rec.audioPath,
        duration: rec.duration ?? null,
        mime: rec.mime ?? null,
        transcript: rec.transcript ?? null,
        status: rec.status || 'uploaded',
        error_code: rec.errorCode ?? null,
        created_at: rec.createdAt,
      });
      return mapRecording(stmts.getRecording.get(rec.id));
    },

    async getRecording(id) {
      return mapRecording(stmts.getRecording.get(id));
    },

    async countBubbles() {
      return stmts.countBubbles.get().n;
    },

    async markRecordingTranscribed(id, transcript) {
      stmts.updateRecording.run(transcript, 'transcribed', null, id);
      return mapRecording(stmts.getRecording.get(id));
    },

    async markRecordingFailed(id, errorCode) {
      stmts.failRecording.run(errorCode ?? 'PIPELINE_ERROR', id);
      return mapRecording(stmts.getRecording.get(id));
    },

    async addBubbleOnly(bubble) {
      stmts.addBubble.run(
        bubble.id,
        bubble.title,
        bubble.content,
        JSON.stringify(bubble.tags),
        bubble.status,
        bubble.source,
        bubble.x,
        bubble.y,
        bubble.color,
        bubble.jarId ?? null,
        bubble.recordingId ?? null,
        bubble.origin,
        bubble.unclassified ? 1 : 0,
        bubble.schemaVersion,
        bubble.createdAt,
        bubble.updatedAt
      );
      return mapBubble(stmts.getBubble.get(bubble.id));
    },

    async addJar(jar) {
      stmts.addJar.run(
        jar.id,
        jar.theme,
        jar.themeColor ?? null,
        jar.createdAt
      );
      return mapJar(stmts.getJar.get(jar.id));
    },

    async markUnclassified(id) {
      stmts.markUnclassified.run(new Date().toISOString(), id);
      return mapBubble(stmts.getBubble.get(id));
    },

    async archiveBubbleToJar(bubbleId, jarId) {
      stmts.archiveBubble.run(jarId, new Date().toISOString(), bubbleId);
      return mapBubble(stmts.getBubble.get(bubbleId));
    },

    async saveAssociationScore(score) {
      stmts.addScore.run(
        score.id,
        score.baseBubbleId,
        score.targetBubbleId,
        score.semantic,
        score.tag,
        score.topic,
        score.keyword,
        score.total,
        score.passed ? 1 : 0,
        score.reason,
        score.createdAt
      );
    },

    /* 同事务：参与方置 archived + 写结果 bubble + 写 fusion 记录 */
    async saveFusion({ fusionId, resultBubble, participantIds }) {
      const now = new Date().toISOString();
      const apply = db.transaction(() => {
        for (const pid of participantIds) {
          stmts.markBubbleArchived.run(now, pid);
        }
        stmts.addBubble.run(
          resultBubble.id,
          resultBubble.title,
          resultBubble.content,
          JSON.stringify(resultBubble.tags),
          resultBubble.status,
          resultBubble.source,
          resultBubble.x,
          resultBubble.y,
          resultBubble.color,
          resultBubble.jarId ?? null,
          resultBubble.recordingId ?? null,
          resultBubble.origin,
          resultBubble.unclassified ? 1 : 0,
          resultBubble.schemaVersion,
          resultBubble.createdAt,
          resultBubble.updatedAt
        );
        stmts.addFusionRecord.run(
          fusionId,
          resultBubble.id,
          JSON.stringify(participantIds),
          now
        );
      });
      apply();
      return mapBubble(stmts.getBubble.get(resultBubble.id));
    },

    async deleteBubble(id) {
      const info = stmts.deleteBubble.run(id);
      return { deleted: info.changes };
    },

    /* 级联删除：事务内先删罐内全部泡泡，再删罐子 */
    async deleteJarCascade(id) {
      const jarBubbles = stmts.listJarBubbles.all(id);
      const apply = db.transaction(() => {
        for (const b of jarBubbles) {
          stmts.deleteBubble.run(b.id);
        }
        stmts.deleteJar.run(id);
      });
      apply();
      return { deletedBubbles: jarBubbles.length };
    },
  };
}
