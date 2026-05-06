-- 025_pair_template_images.sql
-- Pares cada template con su imagen del histórico de p4 buscando interactions
-- message_out donde meta.media_caption ≈ template.body (primeros 100 chars).

UPDATE templates t
   SET image_url = i.media_url,
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (LEFT(meta->>'media_caption', 100))
      meta->>'media_url'     AS media_url,
      meta->>'media_caption' AS caption,
      LEFT(meta->>'media_caption', 100) AS caption_key,
      MAX(id) OVER (PARTITION BY LEFT(meta->>'media_caption', 100)) AS keep_id,
      id
    FROM interactions
    WHERE kind = 'message_out'
      AND meta->>'message_type' = 'image'
      AND meta->>'media_url' IS NOT NULL
      AND meta->>'media_caption' IS NOT NULL
      AND length(meta->>'media_caption') > 30
    ORDER BY LEFT(meta->>'media_caption', 100), id DESC
  ) i
 WHERE LEFT(t.body, 100) = LEFT(i.caption, 100)
   AND t.image_url IS NULL;

SELECT
  count(*) FILTER (WHERE image_url IS NOT NULL) AS con_imagen,
  count(*) AS total
FROM templates;
