-- Slide decks keep their original file, like PDFs and Word files do.
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'text/plain', 'text/markdown', 'image/jpeg'
   ]
 where id = 'sources';
