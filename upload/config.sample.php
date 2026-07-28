<?php
/**
 * Copy this to config.php and put the real token in it. config.php is ignored by
 * git and is never served: PHP executes it and returns nothing to the browser.
 *
 * The token is the one Filebase shows for an IPFS RPC key — base64 of
 * key:secret:bucket. Treat it as a password; anything holding it can write to
 * the bucket.
 */
return [
    'filebase_token' => 'PASTE_THE_TOKEN_HERE',
];
