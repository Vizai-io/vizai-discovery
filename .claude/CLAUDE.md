# VizAI Migration Discipline Rules

* There must only be ONE active scan execution path.
* There must only be ONE active persistence layer.
* Firestore is deprecated and must not receive new writes.
* All new functionality must target Postgres only.
* Do not create temporary hybrid systems.
* Remove old execution paths instead of extending them.
* Prefer deletion over compatibility layers.
* Do not introduce new infrastructure during migration stabilization.
* Product consistency is more important than feature velocity.
