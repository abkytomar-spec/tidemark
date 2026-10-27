Tidemark Hostinger release

public_html/ replaces the domain public_html contents.
tidemark-private/ belongs beside public_html; rename config.example.php to config.php and enter the MySQL details.
database/schema.sql is imported once into that MySQL database.

Keep tidemark-private and database outside public_html.

GYM UPGRADE

The app navigation is Today, Calendar, Gym, Goals, and Log. First-time Gym setup asks for a primary goal, fixed or flexible rest, training weekdays, weekly session target, routine, and units. Fixed rest follows its selected weekdays. Flexible rest can replace a training or open day until the weekly allowance reaches zero.

Workout completion requires a live-camera proof photo. There is no device-gallery or file-upload fallback. Keep all photo files private in tidemark-private/proofs. The private Log gallery separates Gym, Goals, Tasks, and Daily photos. Seven qualifying proof-backed workouts grow at most one Gym Streak Anchor; seven productive days grow a separate app-wide Anchor.

Existing site: back up the database and tidemark-private first. Upload the release without overwriting tidemark-private/config.php, then import every unapplied SQL file in database/migrations in filename order.
New site: import database/schema.sql; it already includes Gym.
