do $fix$
declare definition text;
begin
 select pg_get_functiondef('public.pw_media_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'notes text:=','reason text:=');
 definition:=replace(definition,'length(notes)','length(reason)');
 definition:=replace(definition,'auth.uid(),notes)','auth.uid(),reason)');
 definition:=replace(definition,'and category in(''homework'',''practice'')','and category in(''homework'',''practice'') and (mime like ''video/%'' or mime like ''audio/%'' or mime in(''image/jpeg'',''image/png'',''image/webp''))');
 execute definition;
end $fix$;
