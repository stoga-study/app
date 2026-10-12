-- Photos of notes are stored as the JPEG the app makes for reading them (smaller, and opens anywhere).
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'text/plain', 'text/markdown', 'image/jpeg'
   ]
 where id = 'sources';
