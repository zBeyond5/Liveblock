// modules/packetlive.js — Sang Analyzer + Sender + IA (v5)
// v5: Notebook persistente, Correlator OUT↔IN, Fuzzer de bytes, Race Tester,
// tab PESQUISA com 4 sub-abas, IA com contexto do notebook, cleanup completo.
(function() {
    'use strict';
    const UID = '_analyzer';
    if (window[UID]) { try { window[UID].kill(); } catch(e) {} }

    const MODELO_SANGMAX = 'openai/gpt-oss-120b';

    // ═══════════════════════════════════════════════════════════════
    // DICIONÁRIO DO PROTOCOLO
    // ═══════════════════════════════════════════════════════════════
    const PacketNames = {
        OUT: {
            5:'ROOM_AMBASSADOR_ALERT',9:'ROOM_COMPETITION_INIT',20:'UNIT_CHAT_SHOUT',25:'USER_FURNITURE',
            28:'SET_RELATIONSHIP_STATUS',36:'CLIENT_VARIABLES',49:'START_CAMPAIGN',71:'FIND_NEW_FRIENDS',
            84:'GROUP_FAVORITE',114:'MESSENGER_RELATIONSHIPS',146:'POLL_ANSWER',147:'ACCEPT_QUEST',
            149:'CALL_FOR_HELP_FROM_PHOTO',150:'FURNITURE_POSTIT_PLACE',164:'TOGGLE_PET_BREEDING',
            195:'ITEM_CLOTHING_REDEEM',197:'PICK_ISSUES',199:'HARVEST_PET',206:'FORWARD_TO_A_COMPETITION_ROOM',
            220:'USER_UNIGNORE',230:'USER_HOME_ROOM',239:'PET_CONFIRM_BREEDING',242:'GET_INTERSTITIAL',
            277:'SAVE_WARDROBE_OUTFIT',302:'RENTABLE_SPACE_RENT',324:'GET_CFH_STATUS',337:'PURCHASE_ROOM_AD',
            343:'GAMES_LIST',350:'ITEM_COLOR_WHEEL_CLICK',351:'TRADE_CONFIRM',362:'EMAIL_CHANGE',
            379:'HELPER_TALENT_TRACK',381:'GET_ROOM_AD_PURCHASE_INFO',390:'ROOM_AD_PURCHASE_INITIATED',
            394:'ROOM_MUTE',395:'ROOM_MODEL_SAVE',396:'GET_DAILY_QUEST',399:'ROOM_TONER_APPLY',
            405:'GUIDE_SESSION_ON_DUTY_UPDATE',415:'MYSTERYBOXWAITINGCANCELEDMESSAGE',427:'TRY_PHONE_NUMBER',
            446:'MARKETPLACE_SELL_ITEM',448:'GET_CATALOG_PAGE',450:'GROUP_MEMBERS',452:'CLIENT_LATENCY_MEASURE',
            471:'GET_CONCURRENT_USERS_GOAL_PROGRESS',477:'USER_IGNORE_ID',485:'DECLINE_FRIEND',
            499:'GET_PRODUCT_OFFER',520:'MY_ROOM_HISTORY_SEARCH',543:'PET_SUPPLEMENT',
            565:'USER_PROFILE',575:'GET_SEASONAL_CALENDAR_DAILY_OFFER',597:'GET_FORUM_MESSAGES',
            598:'GET_OCCUPIED_TILES',608:'GROUP_PARTS',609:'USER_BADGES_CURRENT',612:'ONE_WAY_DOOR_CLICK',
            613:'GROUP_UNFAVORITE',615:'SHOP_TARGETED_OFFER_VIEWED',626:'GET_IS_USER_PART_OF_COMPETITION',
            628:'GET_FORUMS_LIST',645:'MARKETPLACE_REQUEST_OWN_ITEMS',668:'USER_PROFILE_BY_NAME',
            678:'REMOVE_FRIEND',679:'GET_CRAFTING_RECIPE',680:'GUIDE_SESSION_CREATE',681:'USER_PETS',
            684:'PET_CANCEL_BREEDING',698:'GUIDE_SESSION_IS_TYPING',699:'TRADE_ITEM',
            703:'GROUP_DELETE',722:'UNSEEN_RESET_ITEMS',730:'GROUP_SAVE_BADGE',738:'GROUP_ADMIN_ADD',
            745:'USER_MOTTO',747:'ITEM_STACK_HELPER',752:'ROOM_CREATE',779:'GET_YOUTUBE_DISPLAY_STATUS',
            789:'USER_CLASSIFICATION',801:'TRADE',810:'UPDATE_FORUM_READ_MARKER',826:'MESSENGER_INIT',
            839:'TRADE_CLOSE',840:'MARKETPLACE_CONFIG',851:'SCR_GET_KICKBACK_INFO',857:'ITEM_DICE_CLOSE',
            880:'PET_SELECTED',882:'POLL_REJECT',885:'PET_PLACE',891:'GROUP_REQUEST_DECLINE',
            895:'SECURITY_MACHINE',898:'ROOM_DELETE',899:'UNIT_ACTION',902:'FORUM_MODERATE_MESSAGE',
            904:'ROOM_MUTE_USER',928:'FURNITURE_GROUP_INFO',929:'VERIFY_CODE',956:'USER_BOTS',
            959:'CHAT_REVIEW_GUIDE_DETACHED',966:'GROUP_SAVE_INFORMATION',973:'GET_NOW_PLAYING',
            986:'WELCOME_GIFT_CHANGE_EMAIL',993:'MODTOOL_REQUEST_USER_CHATLOG',1003:'ROOM_RIGHTS_GIVE',
            1010:'MODTOOL_ROOM_ALERT',1017:'GET_OFFICIAL_ROOMS',1019:'ROOMS_WHERE_MY_FRIENDS_ARE',
            1020:'BOT_CONFIGURATION',1029:'MARKETPLACE_BUY_OFFER',1043:'USER_SETTINGS_CHAT_STYLE',
            1051:'ITEM_DIMMER_TOGGLE',1053:'GUIDE_SESSION_GUIDE_DECIDES',1089:'CALL_FOR_HELP_FROM_IM',
            1100:'HANDSHAKE_COMPLETE_DIFFIE',1109:'FORWARD_TO_RANDOM_COMPETITION_ROOM',1110:'FURNITURE_RANDOMSTATE',
            1111:'GET_PROMO_ARTICLES',1116:'NAVIGATOR_SEARCH_CLOSE',1129:'ACHIEVEMENT_LIST',
            1150:'UNIT_TYPING_STOP',1152:'MOD_TOOL_USER_INFO',1157:'CLIENT_LATENCY',1181:'FORUM_MODERATE_THREAD',
            1187:'ROOM_BAN_GIVE',1189:'ROOM_DIRECTORY_ROOM_NETWORK_OPEN_CONNECTION',1195:'GET_OFFICIAL_SONG_ID',
            1198:'GUIDE_SESSION_REPORT',1214:'USER_RESPECT',1221:'MARKETPLACE_BUY_TOKENS',
            1225:'GAME2GETACCOUNTGAMESTATUSMESSAGE',1271:'PET_OPEN_PACKAGE',1275:'MODTOOL_REQUEST_ROOM_INFO',
            1279:'RESET_PHONE_NUMBER_STATE',1281:'WIRED_OPEN',1283:'GROUP_UNBLOCK_MEMBER',
            1305:'PET_MOUNT',1312:'UNIT_TYPING',1313:'REQUEST_FRIEND',1315:'CHAT_REVIEW_SESSION_CREATE',
            1324:'UNIT_CHAT_WHISPER',1327:'USER_IGNORED',1337:'EMAIL_GET_STATUS',1338:'FURNITURE_POSTIT_SAVE_STICKY_POLE',
            1351:'ROOM_FAVORITE',1355:'MY_FRIENDS_ROOM_SEARCH',1360:'FURNITURE_PICKUP',
            1365:'WIRED_TRIGGER_SAVE',1372:'BUILDERS_CLUB_PLACE_WALL_ITEM',1390:'USER_FIGURE',
            1392:'REQUEST_CAMERA_CONFIGURATION',1403:'GET_COMMUNITY_GOAL_HALL_OF_FAME',1409:'CALL_FOR_HELP_FROM_FORUM_MESSAGE',
            1411:'CRAFT_SECRET',1412:'GET_CFH_CHATLOG',1438:'REQUESTABADGE',1444:'GET_CRAFTING_RECIPES_AVAILABLE',
            1461:'VISIT_USER',1477:'NAVIGATOR_DELETE_SAVED_SEARCH',1479:'REJECT_QUEST',
            1482:'GET_HABBO_CLUB_EXTEND_OFFER',1518:'GET_GUIDE_REPORTING_STATUS',1533:'REQUEST_MARKETPLACE_ITEM_STATS',
            1541:'GET_GIFT_WRAPPING_CONFIG',1548:'CALL_FOR_HELP',1551:'GROUP_SAVE_COLORS',
            1555:'RENDER_ROOM',1596:'MARKETPLACE_TAKE_BACK_ITEM',1611:'GROUP_REQUEST',
            1613:'CRAFT',1614:'GET_CLUB_OFFERS',1624:'FORUM_UPDATE_THREAD',1625:'MODTOOL_SANCTION_BAN',
            1629:'REMOVE_JUKEBOX_DISK',1642:'DESKTOP_VIEW',1647:'FRIEND_LIST_UPDATE',1648:'TRADE_CANCEL',
            1678:'UNIT_CHAT',1711:'CALL_FOR_HELP_FROM_FORUM_THREAD',1719:'MESSENGER_CHAT',
            1723:'GROUP_REQUEST_ACCEPT',1730:'WIRED_ACTION_SAVE',1737:'NAVIGATOR_SEARCH_OPEN',
            1745:'MODTOOL_PREFERENCES',1755:'FURNITURE_MULTISTATE',1763:'UPDATE_FORUM_SETTINGS',
            1772:'GROUP_BUY',1784:'TALENT_TRACK_GET_LEVEL',1814:'RENTABLE_SPACE_STATUS',
            1818:'DEFAULT_SANCTION',1835:'NAVIGATOR_SEARCH',1839:'USER_EFFECT_ACTIVATE',
            1864:'CATALOG_REDEEM_VOUCHER',1876:'ROOM_LIKE',1891:'FRIEND_FURNI_CONFIRM_LOCK',
            1894:'ROOM_BAN_REMOVE',1896:'PETS_BREED',1903:'GROUP_CREATE_OPTIONS',1907:'ROOMS_WITH_HIGHEST_SCORE_SEARCH',
            1913:'USER_SUBSCRIPTION',1918:'NEW_USER_EXPERIENCE_SCRIPT_PROCEED',1922:'GUIDE_SESSION_INVITE_REQUESTER',
            1925:'ROOM_RIGHTS_REMOVE',1933:'ROOM_AD_SEARCH',1935:'GROUP_SETTINGS',
            1937:'GO_TO_FLAT',1947:'CONVERT_GLOBAL_ROOM_ID',1948:'ITEM_DICE_CLICK',
            1953:'GET_FORUM_THREAD',1959:'ROOM_KICK',1961:'GAME2GETWEEKLYLEADERBOARD',
            1978:'ROOM_FILTER_WORDS',1979:'LEAVEQUEUEMESSAGE',1981:'TOGGLE_PET_RIDING',
            1995:'ROOM_FAVORITE_REMOVE',2011:'FOLLOW_FRIEND',2019:'USER_CURRENCY',
            2031:'ROOM_ENTER',2060:'GET_CATALOG_INDEX',2075:'ROOM_RIGHTS_REMOVE_OWN',
            2078:'BUILDERS_CLUB_QUERY_FURNI_COUNT',2081:'MODTOOL_SANCTION_TRADELOCK',
            2086:'SET_CLOTHING_CHANGE_DATA',2110:'GROUP_MEMBERSHIPS',2113:'GET_SECONDS_UNTIL',
            2120:'PHOTO_COMPETITION',2123:'GUIDE_SESSION_GET_REQUESTER_ROOM',2125:'SUBMIT_ROOM_TO_COMPETITION',
            2135:'NEW_USER_EXPERIENCE_GET_GIFTS',2141:'CLOSE_ISSUES',2143:'DISCONNECT',
            2151:'GET_BONUS_RARE_INFO',2157:'DELETE_PENDING_CALLS_FOR_HELP',2162:'VOTE_FOR_ROOM',
            2170:'MODTOOL_REQUEST_USER_ROOMS',2177:'ROOM_TEXT_SEARCH',2179:'CLIENT_TOOLBAR_TOGGLE',
            2202:'UNIT_DROP_HAND_ITEM',2223:'USER_EFFECT_ENABLE',2225:'USER_INFO',
            2236:'ITEM_PAINT',2243:'MODTOOL_SANCTION_ALERT',2253:'GET_FORUM_STATS',
            2255:'GET_QUIZ_QUESTIONS',2270:'GROUP_MEMBER_REMOVE',2287:'GET_POPULAR_ROOM_TAGS',
            2288:'USER_TAGS',2297:'GROUP_BADGES',2303:'PET_INFO',2322:'CLOSE_ISSUE_DEFAULT_ACTION',
            2328:'GET_ITEM_DATA',2334:'GETWEEKLYGAMEREWARDWINNERS',2335:'MESSENGER_FRIENDS',
            2342:'GET_FRIEND_REQUESTS',2345:'BOT_PICKUP',2351:'MARKETPLACE_REQUEST_OFFERS',
            2367:'GET_PET_TRAINING_PANEL',2376:'CATALOG_SELECT_VIP_GIFT',2381:'CHAT_REVIEW_GUIDE_VOTE',
            2400:'REQUEST_SELL_ITEM',2401:'HABBO_SEARCH',2414:'ROOM_SETTINGS_SAVE',
            2465:'ADD_JUKEBOX_DISK',2472:'USER_SETTINGS_INVITES',2476:'USE_PET_PRODUCT',
            2477:'GAMES_INIT',2478:'FURNITURE_ALIASES',2484:'GET_USER_EVENT_CATS',
            2487:'TRADE_ACCEPT',2488:'REQUESTFURNIINVENTORYWHENNOTINROOM',2519:'RENTABLE_EXTEND_RENT_OR_BUYOUT_FURNI',
            2522:'GROUP_ADMIN_REMOVE',2539:'USER_BADGES_CURRENT_UPDATE',2547:'GROUP_MEMBER_REMOVE_CONFIRM',
            2553:'ROOM_MODEL',2564:'GET_GUEST_ROOM',2567:'RECYCLER_STATUS',2569:'CALL_FOR_HELP_FROM_SELFIE',
            2594:'ROOM_FILTER_WORDS_MODIFY',2602:'HANDSHAKE_INIT_DIFFIE',2618:'USER_SETTINGS_OLD_CHAT',
            2652:'ITEM_WALL_UPDATE',2657:'USER_SETTINGS_VOLUME',2658:'CHECK_USERNAME',
            2661:'GET_USER_FLAT_CATS',2668:'GET_SONG_INFO',2669:'CHANGE_QUEUE',2686:'PRESENT_OPEN_PRESENT',
            2692:'RECYCLER_PRIZES',2699:'APPROVE_NAME',2710:'ROOM_SETTINGS_UPDATE_ROOM_CATEGORY_AND_TRADE',
            2714:'GETGAMESTATUSMESSAGE',2720:'CATALOG_PURCHASE_GIFT',2728:'UNIT_LOOK',
            2734:'NAVIGATOR_CATEGORY_LIST_MODE',2741:'MODTOOL_ALERTEVENT',2743:'CANCEL_ROOM_EVENT',
            2750:'PUBLISH_PHOTO',2751:'ROOM_RIGHTS_REMOVE_ALL',2761:'FURNITURE_PLACE',
            2765:'GUIDE_SESSION_REQUESTER_CANCELS',2766:'MARKETPLACE_REDEEM_CREDITS',2769:'COMPETITION_ROOM_SEARCH',
            2793:'MY_GUILD_BASES_SEARCH',2824:'SET_YOUTUBE_DISPLAY_PLAYLIST',2831:'CAN_CREATE_ROOM',
            2832:'UNSEEN_RESET_CATEGORY',2835:'APPROVE_ALL_MEMBERSHIP_REQUESTS',2855:'BUILDERS_CLUB_PLACE_ROOM_ITEM',
            2865:'UNIT_DANCE',2888:'MANNEQUIN_SAVE_LOOK',2902:'SECURITY_TICKET',
            2908:'MY_ROOM_RIGHTS_SEARCH',2918:'GAMEUNLOADEDMESSAGE',2921:'CONTROL_YOUTUBE_DISPLAY_PLAYBACK',
            2924:'POPULAR_ROOMS_SEARCH',2926:'GET_USER_SONG_DISKS',2969:'GET_SOUND_MACHINE_PLAYLIST',
            2985:'MY_ROOMS_SEARCH',2989:'GET_WARDROBE',2992:'REMOVE_PET_SADDLE',
            2999:'RENTABLE_EXTEND_RENT_OR_BUYOUT_STRIP_ITEM',3007:'RELEASE_ISSUES',3013:'SEND_ROOM_INVITE',
            3014:'FURNITURE_FLOOR_UPDATE',3044:'BOT_SKILL_SAVE',3047:'REMOVE_WALL_ITEM',
            3053:'UNIT_GIVE_HANDITEM',3074:'PURCHASE_TARGETED_OFFER',3085:'POLL_CONTENTS',
            3110:'FRIEND_REQUEST_QUEST_COMPLETE',3118:'ITEM_WALL_CLICK',3124:'PURCHASE_VIP_MEMBERSHIP_EXTENSION',
            3125:'GET_CRAFTABLE_PRODUCTS',3127:'MANNEQUIN_SAVE_NAME',3147:'JOINQUEUEMESSAGE',
            3207:'MARK_CATALOG_NEW_ADDITIONS_PAGE_OPENED',3214:'ROOM_STAFF_PICK',3236:'NAVIGATOR_SEARCH_SAVE',
            3241:'ROOM_RIGHTS_LIST',3242:'USER_BADGES',3245:'GET_CURRENT_TIMING_CODE',
            3265:'PEER_USERS_CLASSIFICATION',3270:'RENTABLE_GET_RENT_OR_BUYOUT_OFFER',
            3287:'ROOM_SETTINGS',3301:'GROUP_INFO',3306:'SET_PHONE_NUMBER_VERIFICATION_STATUS',
            3310:'GET_CATALOG_PAGE_WITH_EARLIEST_EXP',3318:'COMMUNITY_GOAL_VOTE_COMPOSER',
            3320:'GET_UNREAD_FORUMS_COUNT',3321:'MODTOOL_SANCTION',3324:'FORWARD_TO_RANDOM_PROMOTED_ROOM',
            3332:'TRADE_ITEMS',3342:'USER_IGNORE',3357:'OPEN_CAMPAIGN_CALENDAR_DOOR',
            3361:'GET_IS_OFFER_GIFTABLE',3365:'SET_OBJECT_DATA',3382:'WIRED_APPLY_SNAPSHOT',
            3386:'ACCEPT_FRIEND',3393:'GROUP_SAVE_PREFERENCES',3397:'PURCHASE_PHOTO',
            3405:'GUILD_BASE_SEARCH',3409:'TRACKING_LAG_WARNING_REPORT',3417:'GET_QUESTS',
            3419:'GET_FORUM_THREADS',3427:'SET_ROOM_SESSION_TAGS',3429:'ROOM_DOORBELL',
            3442:'FORWARD_TO_A_SUBMITTABLE_ROOM',3443:'GET_SEASONAL_QUESTS_ONLY',3456:'UNIT_POSTURE',
            3469:'UNIT_GIVE_HANDITEM_PET',3473:'ROOM_BAN_LIST',3478:'PET_PICKUP',
            3498:'TRADE_UNACCEPT',3505:'EDIT_ROOM_EVENT',3539:'RECYCLER_ITEMS',
            3552:'POST_QUIZ_ANSWERS',3561:'ROOM_AD_EVENT_TAB_CLICKED',3563:'GET_JUKEBOX_PLAYLIST',
            3564:'OPEN_CAMPAIGN_CALENDAR_DOOR_STAFF',3570:'ACHIEVEMENT_RESOLUTION_OPEN',
            3574:'RENDER_ROOM_THUMBNAIL',3585:'RENTABLE_SPACE_CANCEL_RENT',3603:'POLL_START',
            3609:'ITEM_DIMMER_SETTINGS',3633:'GET_TARGETED_OFFER',3635:'ITEM_DIMMER_SAVE',
            3639:'NAVIGATOR_INIT',3655:'CATALOG_PURCHASE',3657:'MODTOOL_SANCTION_MUTE',
            3661:'SET_TARGETTED_OFFER_STATE',3663:'MODTOOL_CHANGE_ROOM_SETTINGS',3677:'CANCEL_QUEST',
            3687:'CHAT_REVIEW_GUIDE_DECIDES',3705:'WIRED_CONDITION_SAVE',3710:'ACTIVATE_QUEST',
            3732:'CHANGE_USERNAME',3750:'GET_COMMUNITY_GOAL_PROGRESS',3762:'GUIDE_SESSION_FEEDBACK',
            3769:'INTERSTITIAL_SHOWN',3783:'GET_SOUND_SETTINGS',3793:'CATALOG_REQUESET_PET_BREEDS',
            3794:'NAVIGATOR_SETTINGS_SAVE',3802:'SET_ITEM_DATA',3804:'ITEM_EXCHANGE_REDEEM',
            3865:'GET_PENDING_CALLS_FOR_HELP',3879:'USER_SETTINGS_CAMERA',3886:'GET_LIMITED_OFFER_APPEARING_NEXT',
            3888:'GET_CONCURRENT_USERS_REWARD',3904:'EVENT_TRACKER',3905:'GETGAMEACHIEVEMENTSMESSAGE',
            3924:'UNIT_SIGN',3926:'TRADE_ITEM_REMOVE',3942:'FORWARD_TO_SOME_ROOM',
            3950:'GET_ROOM_ENTRY_TILE',3951:'OPEN_QUEST_TRACKER',3953:'FORUM_POST_MESSAGE',
            3964:'MY_FAVOURITE_ROOMS_SEARCH',3966:'PURCHASE_BASIC_MEMBERSHIP_EXTENSION',
            3968:'GET_BADGE_POINTS_LIMITS',3976:'BOT_PLACE',3977:'MODTOOL_SANCTION_KICK',
            3981:'GETISBADGEREQUESTFULFILLED',3989:'WELCOME_OPEN_GIFT',3998:'GET_BUNDLE_DISCOUNT_RULESET',
            4000:'RELEASE_VERSION',6003:'SET_AREA_HIDE_DATA',6004:'UNIT_CHAT_REACTION',
            6005:'WIRED_ADDON_SAVE',6006:'WIRED_SELECTOR_SAVE',6007:'WIRED_VARIABLES_SAVE',
            6008:'FURNI_APPLY_COLOURS',10001:'CLICK_FURNI',10003:'FURNITURE_PICKUP_ALL',
            10004:'DELETE_ITEM',10005:'USER_BACKGROUND_CURRENT'
        },
        IN: {
            4:'DISCONNECT_REASON',10:'NAVIGATOR_METADATA',22:'PET_FIGURE_UPDATE',
            25:'UNIT_CHAT_SHOUT',26:'FLOOD_CONTROL',66:'NEW_USER_EXPERIENCE_GIFT_OFFER',
            73:'LOVELOCK_FURNI_START',95:'TRADE_ACCEPTED',101:'INFO_FEED_ENABLE',
            104:'REDEEM_VOUCHER_OK',121:'ROOM_SETTINGS_SAVE',122:'ROOM_SETTINGS',
            140:'ROOM_BAN_LIST',143:'BONUS_RARE_INFO',148:'GROUP_MEMBER',149:'PET_STATUS',
            151:'NAVIGATOR_OPEN_ROOM_CREATOR',156:'DESKTOP_VIEW',162:'USER_PET_ADD',
            176:'WEEKLY_GAME_REWARD',185:'COMMUNITY_GOAL_PROGRESS',194:'PET_INFO',
            200:'ROOM_MODEL_DOOR',202:'GENERIC_ERROR',203:'FURNITURE_STATE',205:'GAME_CENTER_GAME_LIST',
            225:'WIRED_CONDITION',242:'GUIDE_TICKET_RESOLUTION',248:'NOT_ENOUGH_BALANCE',
            263:'CLUB_GIFT_INFO',266:'CAMERA_PUBLISH_STATUS',289:'BADGE_REQUEST_FULFILLED',
            295:'BOT_FORCE_OPEN_CONTEXT_MENU',299:'GOTMYSTERYBOXPRIZEMESSAGE',313:'PET_LEVEL_UPDATE',
            316:'QUEST_CANCELLED',320:'ROOM_MODEL',321:'HOTEL_CLOSES_AND_OPENS_AT',
            332:'ACHIEVEMENT_PROGRESSED',341:'ITEM_WALL_REMOVE',347:'ACCOUNT_SAFETY_LOCK_STATUS_CHANGE',
            352:'USER_PERMISSIONS',363:'GROUP_FORUM_DATA',369:'CHAT_REVIEW_SESSION_OFFERED_TO_GUIDE',
            372:'ROOM_INFO_OWNER',390:'GENERIC_ALERT',407:'YOUTUBE_DISPLAY_PLAYLISTS',
            414:'MESSENGER_MESSAGE_ERROR',416:'GROUP_BADGE_PARTS',418:'GUIDE_SESSION_ERROR',
            427:'REMAINING_MUTE',428:'USER_SUBSCRIPTION',430:'COMPETITION_ROOMS_DATA',
            438:'TRADE_CLOSED',450:'GROUP_FORUM_LIST',458:'CHAT_REVIEW_SESSION_VOTING_STATUS',
            462:'CHAT_REVIEW_SESSION_STARTED',463:'GROUP_FORUM_POST_THREAD',468:'CANCELMYSTERYBOXWAITMESSAGE',
            471:'GUIDE_SESSION_INVITED_TO_GUIDE_ROOM',478:'NAVIGATOR_EVENT_CATEGORIES',486:'CONNECTION_ERROR',
            501:'MARKETPLACE_ITEMS_SEARCHED',532:'GUIDE_SESSION_ATTACHED',566:'PHONE_COLLECTION_STATE',
            600:'HOTEL_WILL_CLOSE_MINUTES',602:'ROOM_DOORBELL',615:'FURNITURE_FLOOR_REMOVE',
            623:'USER_FURNITURE',627:'FURNITURE_ALIASES',634:'USER_FAVORITE_ROOM_COUNT',
            641:'WEEKLY_COMPETITIVE_FRIENDS_LEADERBOARD',655:'COMMUNITY_GOAL_HALL_OF_FAME',
            660:'GAMESTATUSMESSAGE',665:'GUIDE_SESSION_REQUESTER_ROOM',668:'ACHIEVEMENTRESOLUTIONPROGRESS',
            677:'COMPETITION_STATUS',681:'MESSENGER_REQUESTS',691:'MODTOOL_ROOM_INFO',
            700:'CLUB_OFFERS',707:'RECYCLER_STATUS',728:'ROOM_RIGHTS_LIST_ADD',
            731:'GET_USER_TAGS',733:'UNIT_INFO',750:'ISSUE_CLOSE_NOTIFICATION',752:'USER_PROFILE',
            757:'ROOM_RIGHTS',780:'NOTIFICATION_ELEMENT_POINTER',787:'ROOM_RIGHTS_CLEAR',
            792:'HANDSHAKE_INIT_DIFFIE',803:'MESSENGER_REQUEST',805:'CUSTOM_USER_NOTIFICATION',
            810:'MESSENGER_RELATIONSHIPS',812:'USER_OUTFITS',814:'QUIZ_DATA',
            846:'CAMPAIGN_CALENDAR_DATA',860:'ROOM_DOORBELL_REJECTED',865:'MESSENGER_MINIMAIL_NEW',
            876:'SECURITY_MACHINE',888:'NAVIGATOR_LIFTED',890:'UNIT_CHAT_WHISPER',
            923:'CONVERTED_ROOM_ID',931:'USER_CURRENCY',933:'MARKETPLACE_CONFIG',
            938:'TALENT_TRACK_LEVEL',943:'OFFICIAL_SONG_ID',963:'MODERATOR_ACTION_RESULT',
            969:'NAVIGATOR_SEARCHES',971:'PET_CONFIRM_BREEDING_RESULT',981:'PET_PLACING_ERROR',
            982:'PET_TRAINING_PANEL',989:'GROUP_FORUM_UPDATE_THREAD',1007:'ADD_BOT_TO_INVENTORY',
            1021:'MODTOOL_ROOM_CHATLOG',1031:'ROOM_DOORBELL_ACCEPTED',1038:'MESSENGER_CHAT',
            1039:'USER_BADGES',1053:'GUIDE_SESSION_GUIDE_DECIDES',1063:'MOTD_MESSAGES',
            1073:'ROOM_QUEUE_STATUS',1095:'CATALOG_PUBLISHED',1099:'WIRED_OPEN',
            1102:'LOADGAME',1105:'GIFT_WRAPPER_CONFIG',1106:'CATEGORIES_WITH_VISITOR_COUNT',
            1123:'GUILD_EDIT_FAILED',1133:'CRAFTING_RESULT',1137:'ROOM_THICKNESS',
            1146:'UNIT_CHAT',1147:'MESSENGER_INVITE',1162:'NOTIFICATION_LIST',
            1173:'UNIT_NUMBER',1176:'ROOM_SPECTATOR',1183:'NOOBNESS_LEVEL',
            1184:'GROUP_DEACTIVATE',1196:'CONCURRENT_USERS_GOAL_PROGRESS',1200:'FURNITURE_POSTIT_STICKY_POLE_OPEN',
            1205:'QUEST_DAILY',1234:'GROUP_MEMBER_REMOVE_CONFIRM',1237:'UNIT_EXPRESSION',
            1238:'MARKETPLACE_CANCEL_SALE',1242:'PET_NEST_BREEDING_SUCCESS',1243:'ROOM_RIGHTS_LIST',
            1271:'USER_SONG_DISKS_INVENTORY',1283:'MESSENGER_FRIENDS',1296:'ROOM_SCORE',
            1297:'ISSUE_INFO',1322:'USER_SETTINGS',1323:'CATALOG_RECEIVE_PET_BREEDS',
            1348:'GROUP_FORUM_THREAD_MESSAGES',1349:'WELCOME_GIFT_STATUS',1354:'USER_RESPECT',
            1362:'FURNITURE_FLOOR_ADD',1366:'ITEM_WALL_UPDATE',1410:'MESSENGER_FRIEND_NOTIFICATION',
            1413:'MESSENGER_UPDATE',1414:'GROUP_MEMBERS_REFRESH',1417:'USER_FURNITURE_REMOVE',
            1423:'ROOM_CREATED',1434:'SEASONAL_CALENDAR_OFFER',1450:'USER_CHANGE_NAME',
            1472:'WIRED_TRIGGER',1473:'GROUP_SETTINGS',1486:'PET_SUPPLEMENT',
            1487:'NAVIGATOR_COLLAPSED',1491:'ROOM_MUTED',1507:'GROUP_PURCHASED',
            1516:'UNIT_REMOVE',1519:'GIFT_RECEIVER_NOT_FOUND',1521:'TRADE_YOU_NOT_ALLOWED',
            1537:'CATALOG_PAGE',1541:'LOAD_GAME_URL',1548:'FURNITURE_DATA',
            1554:'SEASONAL_QUESTS',1556:'NOW_PLAYING',1561:'ITEM_DIMMER_SETTINGS',
            1563:'BOT_COMMAND_CONFIGURATION',1577:'ROOM_SETTINGS_CHAT',1579:'ROOM_INFO_UPDATED',
            1603:'ITEM_WALL_ADD',1610:'GROUP_LIST',1627:'ROOM_ROLLING',1663:'MODERATION_TOOL',
            1670:'MYSTERY_BOX_KEYS',1692:'USER_BADGES_ADD',1702:'AVAILABILITY_STATUS',
            1714:'ITEM_STACK_HELPER',1727:'GUIDE_SESSION_ENDED',1731:'HOTEL_CLOSED_AND_OPENS',
            1747:'GUIDE_TICKET_CREATION_RESULT',1759:'TRADE_COMPLETED',1762:'NAVIGATOR_SETTINGS',
            1770:'TRADE_CONFIRMATION',1773:'HOTEL_MAINTENANCE',1776:'CLIENT_PING',
            1806:'CLUB_GIFT_NOTIFICATION',1818:'LOVELOCK_FURNI_FINISHED',1825:'PET_RECEIVED',
            1835:'CLIENT_LATENCY',1853:'INTERSTITIAL_MESSAGE',1860:'COMPETITION_USER_PART_OF',
            1866:'CRAFTING_RECIPES_AVAILABLE',1880:'COMPETITION_VOTING_INFO',1910:'CLUB_GIFT_SELECTED',
            1933:'USER_HOME_ROOM',1935:'ROOM_MODEL_NAME',1936:'ROOM_RIGHTS_OWNER',
            1943:'MESSENGER_INIT',1958:'QUESTION_FINISHED',1962:'PET_OPEN_PACKAGE_REQUESTED',
            1974:'TRADE_LIST_ITEM',1981:'TOGGLE_PET_RIDING',1993:'QUIZ_RESULTS',
            1997:'USER_EFFECT_LIST',2013:'MODERATOR_MESSAGE',2015:'USER_EFFECT_LIST_REMOVE',
            2016:'CHANGE_EMAIL_RESULT',2032:'ACHIEVEMENT_NOTIFICATION',2045:'GROUP_CREATE_OPTIONS',
            2061:'USER_FURNITURE_POSTIT_PLACED',2064:'USER_BANNED',2068:'TRADE_NOT_OPEN',
            2078:'HANDSHAKE_IDENTITY_ACCOUNT',2079:'CAN_CREATE_ROOM',2087:'CFH_SANCTION_STATUS',
            2091:'CHAT_REVIEW_SESSION_RESULTS',2104:'ISSUE_DELETED',2106:'PET_BREEDING_RESULT',
            2113:'USER_ACHIEVEMENT_SCORE',2121:'ROOM_MUTED',2129:'CATALOG_PURCHASE_ERROR',
            2139:'MODTOOL_VISITED_ROOMS_USER',2153:'TARGET_OFFER_NOT_FOUND',2175:'MARKETPLACE_OWN_ITEMS',
            2176:'PLAYLIST',2178:'OBJECTS_DATA_UPDATE',2181:'GAMEACHIEVEMENTS',
            2193:'USER_BOTS',2199:'IN_CLIENT_LINK',2224:'MODERATION_USER_INFO',
            2233:'GUIDE_SESSION_STARTED',2242:'ROOM_SPECIAL_EFFECT',2248:'FIRST_LOGIN_OF_DAY',
            2249:'ROOM_MESSAGE_NOTIFICATION',2253:'PET_BREEDING',2254:'GUIDE_SESSION_PARTNER_IS_TYPING',
            2277:'COMPETITION_ENTRY_SUBMIT',2292:'ROOM_HEIGHT_MAP',2294:'MESSENGER_MINIMAIL_COUNT',
            2301:'GROUP_FORUM_UNREAD_COUNT',2327:'HELPER_TALENT_TRACK',2332:'ROOM_HEIGHT_MAP_UPDATE',
            2340:'BUILDERS_CLUB_EXPIRED',2361:'ROOM_ENTER_ERROR',2363:'REDEEM_VOUCHER_ERROR',
            2364:'THUMBNAIL_STATUS',2366:'WIRED_REWARD',2367:'USER_PET_REMOVE',
            2368:'MOTD_MESSAGES',2371:'UNSEEN_ITEMS',2372:'CFH_REPLY',
            2385:'CFH_PENDING_CALLS_DELETED',2399:'JUKEBOX_SONG_DISKS',2405:'ROOM_POPULAR_TAGS_RESULT',
            2407:'ROOM_ENTER',2422:'PHONE_TRY_VERIFICATION_CODE_RESULT',2425:'GET_CLUB_GIFT_INFO',
            2427:'WELCOME_GIFT_CHANGE_EMAIL_RESULT',2429:'CATALOG_PAGE_LIST',2431:'ROOM_RIGHTS_LIST_REMOVE',
            2434:'TALENT_TRACK_LEVEL_UP',2437:'POLL_ERROR',2447:'UNIT_CHANGE_NAME',
            2449:'TRADE_OTHER_NOT_ALLOWED',2454:'WEEKLY_GAME_REWARD_WINNERS',2458:'MESSENGER_FOLLOW_FAILED',
            2464:'ROOM_EVENT_CANCEL',2482:'PET_LEVEL_NOTIFICATION',2488:'QUEST_COMPLETED',
            2491:'GUIDE_ON_DUTY_STATUS',2492:'ACHIEVEMENTRESOLUTIONS',2498:'LOVELOCK_FURNI_FRIEND_COMFIRMED',
            2501:'HANDSHAKE_COMPLETE_DIFFIE',2505:'QUESTION_ANSWERED',2506:'NAVIGATOR_CATEGORIES',
            2512:'MARKETPLACE_SELL_ITEM',2534:'MESSENGER_FIND_FRIENDS',2546:'BUNDLE_DISCOUNT_RULESET',
            2552:'UNLOADGAME',2553:'JUKEBOX_PLAYLIST_FULL',2557:'EPIC_POPUP',
            2563:'ACHIEVEMENT_LIST',2566:'CFH_DISABLED_NOTIFY',2583:'USER_INFO',
            2584:'BOT_ERROR',2589:'GROUP_FORUM_THREADS',2595:'REMOVE_BOT_FROM_INVENTORY',
            2611:'RENTABLE_SPACE_RENT_FAILED',2613:'SCR_SEND_KICKBACK_INFO',2636:'FURNITURE_ITEMDATA',
            2639:'RENTABLE_FURNI_RENT_OR_BUYOUT_OFFER',2645:'SHOWMYSTERYBOXWAITMESSAGE',
            2670:'QUESTION',2684:'USER_EFFECT_ACTIVATE',2705:'CATALOG_PURCHASE_OK',
            2712:'HAND_ITEM_RECEIVED',2719:'NO_SUCH_FLAT',2726:'GIFT_OPENED',
            2739:'ITEM_WALL',2741:'ROOM_EVENT',2764:'RENTABLE_SPACE_RENT_OK',
            2768:'ACHIEVEMENTRESOLUTIONCOMPLETED',2773:'USER_FIGURE',2793:'PET_OPEN_PACKAGE_RESULT',
            2812:'USER_BADGES_CURRENT',2844:'GROUP_FORUM_UPDATE_MESSAGE',2850:'LIMITED_SOLD_OUT',
            2852:'TARGET_OFFER',2863:'CATALOG_PURCHASE_NOT_ALLOWED',2868:'LEFTQUEUE',
            2914:'CRAFTABLE_PRODUCTS',2918:'CFH_RESULT_MESSAGE',2925:'USER_FURNITURE_REFRESH',
            2929:'FURNITURE_FLOOR_UPDATE',2945:'GROUP_FORUM_POST',2950:'CATALOG_APPROVE_NAME_RESULT',
            2952:'USER_FAVORITE_ROOM',2953:'COMPETITION_SECONDS_UNTIL',2986:'USER_PERKS',
            3004:'COMMUNITY_GOAL_VOTE_EVENT',3019:'UNIT_IDLE',3031:'CAMPAIGN_CALENDAR_DOOR_OPENED',
            3050:'GUILD_MEMBER_MGMT_FAILED',3058:'ROOM_AD_ERROR',3064:'FAVORITE_GROUP_UDPATE',
            3067:'UNIT_HAND_ITEM',3071:'INIT_CAMERA',3074:'POLL_OFFER',
            3081:'USER_CREDITS',3084:'BOT_SKILL_LIST_UPDATE',3085:'POLL_CONTENTS',
            3099:'PET_SCRATCH_FAILED',3111:'UNIT',3115:'WEEKLY_COMPETITIVE_LEADERBOARD',
            3123:'PET_EXPERIENCE',3163:'ROOM_INFO',3164:'MARKETPLACE_ITEM_STATS',
            3171:'ISSUE_PICK_FAILED',3173:'GUIDE_REPORTING_STATUS',3186:'GROUP_INFO',
            3194:'COMPETITION_TIMING_CODE',3200:'CFH_TOPICS',3203:'ROOM_GET_FILTER_WORDS',
            3211:'MESSENGER_INSTANCE_MESSAGE_ERROR',3214:'CFH_CHATLOG',3221:'GROUP_MEMBERS',
            3224:'UNIT_DANCE',3250:'GAMEINVITE',3259:'GROUP_BADGES',
            3260:'AUTHENTICATED',3267:'SHOW_ENFORCE_ROOM_CATEGORY',3269:'QUEST',
            3296:'MODERATION_CAUTION',3300:'AVATAR_EFFECT_SELECTED',3301:'CATALOG_EARLIEST_EXPIRY',
            3304:'GUEST_ROOM_SEARCH_RESULT',3312:'USER_CLASSIFICATION',3325:'CAN_CREATE_ROOM_EVENT',
            3350:'TRADE_OPEN',3356:'USER_CLOTHING',3366:'PET_RESPECTED',
            3371:'ROOM_BAN_REMOVE',3378:'CLUB_EXTENDED_OFFER',3386:'FURNITURE_STATE_2',
            3390:'ROOM_SETTINGS_SAVE_ERROR',3397:'YOUTUBE_CONTROL_VIDEO',3398:'PET_GO_TO_BREEDING_NEST_FAILURE',
            3400:'GUIDE_SESSION_MESSAGE',3408:'NAVIGATOR_SEARCH',3417:'GET_QUESTS',
            3425:'MARKETPLACE_AFTER_ORDER_STATUS',3447:'MODERATOR_TOOL_PREFERENCES',3454:'LIMITED_OFFER_APPEARING_NEXT',
            3468:'PURCHASE_TARGETED_OFFER',3497:'FURNITURE_GROUP_CONTEXT_MENU_INFO',
            3498:'CFH_SANCTION',3515:'ROOM_FORWARD',3523:'HOTEL_CLOSES_AND_OPENS_AT',
            3531:'JOINEDQUEUEMESSAGE',3548:'BUILDERS_CLUB_FURNI_COUNT',3555:'EXTENDED_PROFILE_CHANGED',
            3599:'GAME_CENTER_ACHIEVEMENTS',3604:'UNIT_STATUS',3617:'CHAT_REVIEW_SESSION_DETACHED',
            3619:'EMAIL_STATUS',3634:'USER_PROFILE_BY_NAME_RESULT',3654:'MESSENGER_INVITE_ERROR',
            3662:'UNIT_TYPING',3668:'MODTOOL_USER_CHATLOG',3681:'RECYCLER_FINISHED',
            3694:'MESSENGER_SEARCH',3705:'ROOM_SETTINGS_ERROR',3729:'WIRED_ACTION',
            3736:'USER_FURNITURE_ADD',3754:'CRAFTING_RECIPE',3756:'CHECK_USER_NAME',
            3763:'PLAYING_GAME',3772:'PET_CONFIRM_BREEDING_REQUEST',3780:'GUIDE_SESSION_DETACHED',
            3804:'PHONE_TRY_NUMBER_RESULT',3806:'ROOM_AD_PURCHASE',3832:'GROUP_MEMBERSHIP_REQUESTED',
            3852:'WIRED_ERROR',3856:'GAME_CENTER_STATUS',3865:'USER_EFFECT_LIST_ADD',
            3881:'USER_IGNORED',3885:'GROUP_HABBO_JOIN_FAILED',3893:'FURNITURE_FLOOR',
            3895:'USER_IGNORED_RESULT',3902:'CAMERA_PURCHASE_OK',3905:'CFH_PENDING_CALLS',
            3909:'PROMO_ARTICLES',3912:'YOUTUBE_DISPLAY_VIDEO',3917:'USER_PETS',
            3936:'BADGE_POINT_LIMITS',3942:'GROUP_DETAILS_CHANGED',3946:'PRODUCT_OFFER',
            3972:'ACTIVITY_POINT_NOTIFICATION',3980:'RECYCLER_PRIZES',3981:'MESSENGER_ACCEPT_FRIENDS',
            3990:'TRAX_SONG_INFO',4000:'DISCONNECT_REASON',5100:'NOTIFICATION_SIMPLE_ALERT',
            6003:'FURNITURE_OPACITY_DATA',6004:'WIRED_ADDON',6005:'UNIT_CHAT_REACTION',
            6006:'WIRED_MOVEMENTS',6007:'AREA_HIDE',6008:'WIRED_SELECTORS',
            6009:'HANDITEM_CONFIGURATION',20002:'USER_BACKGROUND_CURRENT'
        },
        nome(id, dir) {
            if (id == null) return null;
            const m = dir === 'SEND' ? this.OUT : this.IN;
            return m[id] || null;
        },
        rotulo(id, dir) {
            const n = this.nome(id, dir);
            return n ? `${dir === 'SEND' ? 'OUT' : 'IN'}.${n}` : `${dir === 'SEND' ? 'OUT' : 'IN'}.${id}`;
        }
    };

    // ─── Cleanup global ───
    const cleanup = [];
    const on = (target, type, fn, opts) => {
        target.addEventListener(type, fn, opts);
        cleanup.push(() => { try { target.removeEventListener(type, fn, opts); } catch(e) {} });
    };
    let _alive = true;

    // ─── Storage ───
    const Storage = {
        get(key, def) {
            try {
                const raw = localStorage.getItem(`hl_pro_${key}`);
                if (raw === null) return def;
                return JSON.parse(raw);
            } catch (e) { return def; }
        },
        set(key, val) {
            try { localStorage.setItem(`hl_pro_${key}`, JSON.stringify(val)); } catch (e) {}
        }
    };

    const AppState = {
        blIds: new Set(Storage.get('bl_ids', [])),
        blPayloads: Storage.get('bl_payloads', []),
        dropIds: new Set(Storage.get('drop_ids', [])),
        dropPayloads: Storage.get('drop_payloads', []),
        profiles: Storage.get('profiles', { default: { name: 'Padrão', packets: [], spamInterval: 300, spamQtd: 1 } }),
        currentProfileId: Storage.get('current_profile', 'default'),
        globalPacketCount: 0,
        logs: [],
        maxLogs: 2000,
        isPaused: false,
        killSwitchActive: false,
        fontSize: Storage.get('font_size', 13),
        showSend: true,
        showRecv: true,
        dicionario: Storage.get('dicionario', {})
    };

    const Utils = {
        bufferToHex(buffer) {
            if (!buffer || buffer.byteLength === 0) return '';
            return Array.from(new Uint8Array(buffer))
                .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
        },
        bufferToString(buffer) {
            if (!buffer || buffer.byteLength === 0) return '';
            return new TextDecoder('utf-8').decode(buffer).replace(/[^\x20-\x7E]/g, '\u00B7');
        },
        buildPacket(headerId, hexPayloadStr) {
            const cleanHex = hexPayloadStr.replace(/[^0-9A-Fa-f]/g, '');
            const payloadLen = cleanHex.length / 2;
            const buffer = new ArrayBuffer(4 + 2 + payloadLen);
            const view = new DataView(buffer);
            view.setInt32(0, 2 + payloadLen, false);
            view.setInt16(4, headerId, false);
            const u8 = new Uint8Array(buffer);
            for (let i = 0; i < payloadLen; i++) {
                u8[6 + i] = parseInt(cleanHex.substr(i * 2, 2), 16);
            }
            return buffer;
        },
        parseData(data) {
            if (!(data instanceof ArrayBuffer) || data.byteLength < 6) return null;
            const view = new DataView(data);
            const header = view.getInt16(4, false);
            const fullHex = this.bufferToHex(data);
            const payloadBuf = data.slice(6);
            const payloadHex = this.bufferToHex(payloadBuf);
            return {
                header,
                fullHex,
                payloadHex,
                ascii: this.bufferToString(payloadBuf),
                byteLength: data.byteLength,
                payloadLength: data.byteLength - 6
            };
        }
    };

    const PacketFilter = {
        isVisualBlocked(packet) {
            if (AppState.blIds.has(packet.header)) return true;
            const cleanPacketHex = packet.fullHex.replace(/\s/g, '').toUpperCase();
            for (const rule of AppState.blPayloads) {
                if (cleanPacketHex.includes(rule.replace(/\s/g, '').toUpperCase()) || packet.ascii.includes(rule)) return true;
            }
            return false;
        },
        isNetworkDropped(packet) {
            if (AppState.dropIds.has(packet.header)) return true;
            const cleanPacketHex = packet.fullHex.replace(/\s/g, '').toUpperCase();
            for (const rule of AppState.dropPayloads) {
                if (cleanPacketHex.includes(rule.replace(/\s/g, '').toUpperCase()) || packet.ascii.includes(rule)) return true;
            }
            return false;
        },
        manageList(type, action, val) {
            let targetSet, targetArr, storeKeyId, storeKeyStr;
            if (type === 'VISUAL') {
                targetSet = AppState.blIds; targetArr = AppState.blPayloads;
                storeKeyId = 'bl_ids'; storeKeyStr = 'bl_payloads';
            } else {
                targetSet = AppState.dropIds; targetArr = AppState.dropPayloads;
                storeKeyId = 'drop_ids'; storeKeyStr = 'drop_payloads';
            }
            if (action === 'ADD_ID' && !isNaN(val)) { targetSet.add(Number(val)); Storage.set(storeKeyId, [...targetSet]); }
            if (action === 'ADD_STR' && val) { if (!targetArr.includes(val)) targetArr.push(val); Storage.set(storeKeyStr, targetArr); }
            if (action === 'REMOVE_ID' && !isNaN(val)) { targetSet.delete(Number(val)); Storage.set(storeKeyId, [...targetSet]); }
            if (action === 'REMOVE_STR' && val) { const idx = targetArr.indexOf(val); if (idx > -1) targetArr.splice(idx, 1); Storage.set(storeKeyStr, targetArr); }
            if (action === 'CLEAR') { targetSet.clear(); targetArr.length = 0; Storage.set(storeKeyId, []); Storage.set(storeKeyStr, []); }
        }
    };

    const InboundTransformer = { rules: {}, transform(data) { return data; } };

    // ─── Emitter interno (desacopla camadas) ───
    const Emitter = {
        _map: {},
        on(evt, cb) {
            (this._map[evt] = this._map[evt] || []).push(cb);
            return () => { this._map[evt] = this._map[evt].filter(h => h !== cb); };
        },
        emit(evt, data) {
            (this._map[evt] || []).forEach(cb => {
                try { cb(data); } catch (e) { console.error('[Emitter]', evt, e); }
            });
        },
        clear() { this._map = {}; }
    };

    // ═══════════════════════════════════════════════════════════════
    // NOTEBOOK — base de conhecimento por pacote, persistente
    // ═══════════════════════════════════════════════════════════════
    const Notebook = {
        _cache: null,
        _load() {
            if (this._cache) return this._cache;
            this._cache = Storage.get('notebook', {});
            return this._cache;
        },
        _save() {
            Storage.set('notebook', this._cache);
            Emitter.emit('notebook:changed');
        },
        get(id) { return this._load()[id] || null; },
        update(id, patch) {
            const n = this._load();
            const base = n[id] || { criado: Date.now(), hipoteses: [], resultados: [], notas: [] };
            base.hipoteses = base.hipoteses || [];
            base.resultados = base.resultados || [];
            base.notas = base.notas || [];
            n[id] = Object.assign(base, patch, { atualizado: Date.now() });
            this._save();
            return n[id];
        },
        addHipotese(id, texto) {
            const e = this.get(id) || {};
            const hipoteses = (e.hipoteses || []).concat([{ texto, criadaEm: Date.now(), testada: false, resultado: null }]);
            this.update(id, { hipoteses });
        },
        addNota(id, texto) {
            const e = this.get(id) || {};
            const notas = (e.notas || []).concat([{ texto, em: Date.now() }]);
            this.update(id, { notas });
        },
        addResultado(id, res) {
            const e = this.get(id) || {};
            const resultados = (e.resultados || []).concat([Object.assign({ em: Date.now() }, res)]);
            this.update(id, { resultados });
        },
        remover(id) {
            const n = this._load();
            delete n[id];
            this._save();
        },
        listar() {
            const n = this._load();
            return Object.keys(n).map(id => Object.assign({ id: Number(id) }, n[id]))
                .sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0));
        },
        exportar() { return JSON.stringify(this._load(), null, 2); },
        importar(json) {
            try {
                const dados = JSON.parse(json);
                if (typeof dados !== 'object' || Array.isArray(dados)) return false;
                this._cache = Object.assign(this._load(), dados);
                this._save();
                return true;
            } catch (e) { return false; }
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // CORRELATOR — pareia OUT (envio) com IN (resposta) por janela temporal
    // ═══════════════════════════════════════════════════════════════
    const Correlator = {
        _pendentes: [],
        _janelaMs: 800,
        _pares: null,
        _envios: null,
        _persistTimer: null,
        // IDs que por design não têm resposta — não são suspeitos
        _noise: new Set([452, 2450, 1312, 1150, 1157, 1706]),
        _init() {
            if (this._pares) return;
            this._pares = Storage.get('correlacao_pares', {});
            this._envios = Storage.get('correlacao_envios', {});
        },
        _agendarPersist() {
            if (this._persistTimer) return;
            this._persistTimer = setTimeout(() => {
                this._persistTimer = null;
                if (!this._pares) return;
                Storage.set('correlacao_pares', this._pares);
                Storage.set('correlacao_envios', this._envios);
            }, 2000);
        },
        _flush() {
            if (this._persistTimer) { clearTimeout(this._persistTimer); this._persistTimer = null; }
            if (!this._pares) return;
            Storage.set('correlacao_pares', this._pares);
            Storage.set('correlacao_envios', this._envios);
        },
        registrarEnvio(packet) {
            this._init();
            const id = packet.header;
            this._envios[id] = (this._envios[id] || 0) + 1;
            this._pendentes.push({ outId: id, em: Date.now(), consumido: false });
            if (this._pendentes.length > 100) this._pendentes.shift();
            this._agendarPersist();
        },
        registrarRecebimento(packet) {
            this._init();
            const agora = Date.now();
            // Protocolo sequencial: a resposta corresponde ao pedido mais antigo pendente
            for (let i = 0; i < this._pendentes.length; i++) {
                const p = this._pendentes[i];
                if (p.consumido) continue;
                if (agora - p.em > this._janelaMs) continue;
                p.consumido = true;
                const inId = packet.header;
                if (!this._pares[p.outId]) this._pares[p.outId] = {};
                this._pares[p.outId][inId] = (this._pares[p.outId][inId] || 0) + 1;
                this._agendarPersist();
                return;
            }
        },
        respostasDe(outId) {
            this._init();
            const m = this._pares[outId] || {};
            return Object.entries(m).map(([inId, count]) => ({
                inId: Number(inId),
                inNome: PacketNames.nome(Number(inId), 'RECV'),
                count
            })).sort((a, b) => b.count - a.count);
        },
        suspeitos() {
            this._init();
            const lista = [];
            for (const outId in this._envios) {
                const idNum = Number(outId);
                if (this._noise.has(idNum)) continue;
                const enviados = this._envios[outId];
                if (enviados < 5) continue;
                const respostas = this._pares[outId]
                    ? Object.values(this._pares[outId]).reduce((a, b) => a + b, 0)
                    : 0;
                const taxa = respostas / enviados;
                if (taxa < 0.3) {
                    lista.push({
                        outId: idNum,
                        outNome: PacketNames.nome(idNum, 'SEND') || '?',
                        enviados, respostas,
                        taxa: Math.round(taxa * 100)
                    });
                }
            }
            return lista.sort((a, b) => a.taxa - b.taxa);
        },
        limpar() {
            this._pares = {};
            this._envios = {};
            this._pendentes = [];
            this._flush();
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // FUZZER — itera um byte de um pacote e observa a resposta
    // ═══════════════════════════════════════════════════════════════
    const Fuzzer = {
        _ativo: false,
        _runId: 0,
        _log(msg, tipo) { Emitter.emit('fuzzer:log', { msg, tipo }); },
        async iniciar(cfg) {
            if (this._ativo) return;
            if (!window.gameWS) { this._log('Sem conexão WebSocket.', 'erro'); return; }
            if (!Number.isFinite(cfg.id)) { this._log('ID alvo inválido.', 'erro'); return; }

            this._ativo = true;
            const myRunId = ++this._runId;
            const baseLen = cfg.baseLen || 16;
            const base = new ArrayBuffer(6 + baseLen);
            const baseView = new DataView(base);
            baseView.setInt32(0, 2 + baseLen, false);
            baseView.setInt16(4, cfg.id, false);

            this._log(`Fuzz #${myRunId} — OUT.ID ${cfg.id}, offset ${cfg.offset}, ${cfg.from}..${cfg.to}, delay ${cfg.delay}ms`, 'info');
            const paresAntes = JSON.parse(JSON.stringify(Correlator._pares || {}));

            for (let v = cfg.from; v <= cfg.to; v++) {
                if (!this._ativo || myRunId !== this._runId) break;
                if (!window.gameWS) break;
                const buf = base.slice(0);
                new Uint8Array(buf)[6 + cfg.offset] = v & 0xFF;
                try { window.gameWS.send(buf); }
                catch (e) { this._log(`Erro: ${e.message || e}`, 'erro'); break; }
                this._log(`→ offset[${cfg.offset}] = 0x${v.toString(16).padStart(2,'0').toUpperCase()}`, 'envio');
                await new Promise(r => setTimeout(r, cfg.delay));
            }

            await new Promise(r => setTimeout(r, 500));
            const paresDepois = Correlator._pares || {};
            const novasRespostas = {};
            for (const outId in paresDepois) {
                const antes = (paresAntes[outId] || {});
                for (const inId in paresDepois[outId]) {
                    const d = (paresDepois[outId][inId] || 0) - (antes[inId] || 0);
                    if (d > 0) novasRespostas[inId] = (novasRespostas[inId] || 0) + d;
                }
            }

            const resumo = {
                id: cfg.id, offset: cfg.offset,
                range: `${cfg.from}..${cfg.to}`,
                enviados: cfg.to - cfg.from + 1,
                respostasNovas: novasRespostas,
                momento: Date.now()
            };

            const totalResp = Object.values(novasRespostas).reduce((a, b) => a + b, 0);
            if (totalResp === 0) {
                this._log('✓ Nenhuma resposta nova — campo IGNORADO pelo servidor (candidato a exploit)', 'ok');
            } else {
                const nomes = Object.entries(novasRespostas)
                    .map(([inId, n]) => `${PacketNames.nome(Number(inId), 'RECV') || inId}×${n}`)
                    .join(', ');
                this._log(`⚠ Servidor respondeu: ${nomes} — campo VALIDADO`, 'aviso');
            }

            this._ativo = false;
            Emitter.emit('fuzzer:done', resumo);
        },
        parar() { this._ativo = false; this._runId++; }
    };

    // ═══════════════════════════════════════════════════════════════
    // RACE TESTER — envia N pacotes no mesmo tick
    // ═══════════════════════════════════════════════════════════════
    const RaceTester = {
        async enviarSimultaneo(pacotes) {
            if (!window.gameWS) throw new Error('Sem conexão WebSocket.');
            const validos = pacotes.filter(p => Number.isFinite(p.id));
            if (!validos.length) throw new Error('Nenhum pacote válido.');
            const antes = JSON.parse(JSON.stringify(Correlator._pares || {}));
            const enviados = [];
            for (const p of validos) {
                const buf = Utils.buildPacket(p.id, p.hex || '');
                try {
                    window.gameWS.send(buf);
                    enviados.push(p);
                } catch (e) {
                    throw new Error('Falha ao enviar ' + p.id + ': ' + (e.message || e));
                }
            }
            await new Promise(r => setTimeout(r, 800));
            const depois = Correlator._pares || {};
            const delta = {};
            for (const outId in depois) {
                const a = (antes[outId] || {});
                for (const inId in depois[outId]) {
                    const d = (depois[outId][inId] || 0) - (a[inId] || 0);
                    if (d > 0) {
                        if (!delta[inId]) delta[inId] = 0;
                        delta[inId] += d;
                    }
                }
            }
            return { enviados, respostas: delta };
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // SANG AI SERVICE — prompts orientados a pesquisa de exploit
    // ═══════════════════════════════════════════════════════════════
    const SangAI = {
        _busy: false,

        disponivel() {
            return !!(window._apis?.groq && window._apis.getKey?.('groq'));
        },

        _limpar(txt) {
            return String(txt || '')
                .replace(/^```[a-zA-Z]*\n?/gm, '')
                .replace(/```$/gm, '')
                .replace(/^["'`]+|["'`]+$/g, '')
                .trim();
        },

        _parseJson(txt) {
            const limpo = this._limpar(txt).replace(/```json|```/g, '').trim();
            try { return JSON.parse(limpo); } catch(e) {}
            const m = limpo.match(/\{[\s\S]*\}/);
            if (m) { try { return JSON.parse(m[0]); } catch(e) {} }
            return null;
        },

        async _chamar(systemPrompt, userContent, opts = {}) {
            if (!this.disponivel()) throw new Error('Sang AI não configurada. Abra o módulo Sang AI e cole sua chave.');
            const ctrl = new AbortController();
            const timeoutMs = opts.timeout || 25000;
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            try {
                const resposta = await window._apis.groq({
                    mensagens: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent }
                    ],
                    modelo: MODELO_SANGMAX,
                    maxTokens: opts.maxTokens || 800,
                    temperature: opts.temperature ?? 0.4
                }, { signal: ctrl.signal, forceRefresh: true });
                if (!resposta || !String(resposta).trim()) throw new Error('Sang AI respondeu vazio. Tente de novo.');
                return this._limpar(resposta);
            } catch (e) {
                if (e.name === 'AbortError') throw new Error('Timeout — demorou mais de ' + Math.round(timeoutMs/1000) + 's.');
                if (e.codigo === 'cota-local') throw new Error('Limite local do Groq atingido. Aguarde 1 minuto.');
                if (e.codigo === 'sem-chave') throw new Error('Chave do Groq não configurada.');
                if (e.message && e.message.includes('429')) throw new Error('Rate limit da Groq. Aguarde alguns segundos.');
                throw e;
            } finally { clearTimeout(timer); }
        },

        _contextoBase() {
            const suspeitos = Correlator.suspeitos().slice(0, 5);
            const nb = Notebook.listar().slice(0, 8);

            let extra = '';
            if (suspeitos.length) {
                extra += '\n\nOUTs SUSPEITOS (enviados sem resposta consistente — candidatos a exploit):\n';
                extra += suspeitos.map(s =>
                    `  ${s.outNome} (ID ${s.outId}): ${s.enviados} envios, ${s.respostas} respostas (${s.taxa}%)`
                ).join('\n');
            }
            if (nb.length) {
                extra += '\n\nNOTEBOOK (conhecimento acumulado):\n';
                extra += nb.map(e => {
                    const nome = PacketNames.nome(e.id, 'SEND') || PacketNames.nome(e.id, 'RECV') || '?';
                    const nH = (e.hipoteses || []).length;
                    const nR = (e.resultados || []).length;
                    const nota = (e.notas || []).slice(-1)[0];
                    return `  ID ${e.id} (${nome}): ${nH} hipóteses, ${nR} resultados` +
                        (nota ? ` — última nota: "${nota.texto.slice(0, 80)}"` : '');
                }).join('\n');
            }

            return (
                'Você é Sang AI, pesquisadora de segurança de protocolo numa sessão de jogo online ' +
                'estilo Habbo Hotel (cliente Habblive/Habblet). Você está analisando o tráfego WebSocket ' +
                'do próprio usuário — sessão legítima dele.\n\n' +
                'CONTEXTO TÉCNICO DO PROTOCOLO:\n' +
                'Formato do pacote: 4 bytes big-endian com tamanho total, 2 bytes big-endian com ID do ' +
                'pacote, depois o payload (restante). Sem criptografia.\n\n' +
                'VOCABULÁRIO (ID → nome semântico):\n' +
                '  OUT.xxx = cliente envia pro servidor\n' +
                '  IN.xxx  = servidor responde\n' +
                'IDs com potencial de exploit: UNIT_WALK=2450, UNIT_DANCE=2865, UNIT_CHAT=1678, ' +
                'TRADE_CONFIRM=351, TRADE_ACCEPT=2487, FURNITURE_PLACE=2761, FURNITURE_PICKUP=1360, ' +
                'FURNITURE_PICKUP_ALL=10003, ROOM_RIGHTS_GIVE=1003, ROOM_MODEL_SAVE=395, ' +
                'CATALOG_PURCHASE=3655, DELETE_ITEM=10004, MARKETPLACE_SELL_ITEM=446.\n\n' +
                'MISSÃO:\n' +
                'Ajudar o usuário a entender pacotes e identificar oportunidades de manipulação: ' +
                'campos sem validação server-side, ações em que o servidor confia no cliente, ' +
                'ordens de pacote reordenáveis, IDs enviáveis fora de contexto, estados inconsistentes ' +
                'que geram dupe/glitch. Pense como pesquisador de bug bounty.\n\n' +
                'REGRAS:\n' +
                '- Português brasileiro, direto, específica.\n' +
                '- Sem introdução, sem "claro", sem "vamos lá".\n' +
                '- Nunca invente certeza. Se não souber, diga "provavelmente" ou "possivelmente".\n' +
                '- Mencione IDs e nomes de pacote concretos.\n' +
                '- Se detectar ângulo explorável, diga: "teste assim: ...".' +
                extra
            );
        },

        async analisarPacote(packet) {
            const nome = PacketNames.nome(packet.header, 'SEND')
                      || PacketNames.nome(packet.header, 'RECV')
                      || '?';
            const payloadHexLimitado = packet.payloadHex.length > 800
                ? packet.payloadHex.slice(0, 800) + '…'
                : packet.payloadHex;

            const respostas = Correlator.respostasDe(packet.header);
            const respostaTxt = respostas.length
                ? '\nRespostas conhecidas (OUT): ' + respostas.slice(0, 3)
                    .map(r => `${r.inNome || r.inId}×${r.count}`).join(', ')
                : '';

            const r = await this._chamar(
                this._contextoBase() +
                '\n\nESTRUTURA DA RESPOSTA (máx 5 frases):\n' +
                '1. Propósito provável do pacote\n' +
                '2. O que cada campo do payload representa\n' +
                '3. Se é candidato a exploit — e qual ângulo testar',
                `Analise este pacote:\n\n` +
                `ID: ${packet.header} (nome conhecido: ${nome})\n` +
                `Tamanho total: ${packet.byteLength} bytes | payload: ${packet.payloadLength} bytes\n` +
                `Hex do payload: ${payloadHexLimitado}\n` +
                `ASCII: ${packet.ascii || '(binário)'}${respostaTxt}`,
                { maxTokens: 500 }
            );

            // Auto-save no notebook (sem sobrescrever notas/hipóteses do usuário)
            try {
                const existente = Notebook.get(packet.header);
                if (!existente) {
                    Notebook.update(packet.header, {
                        nome,
                        amostraHex: packet.fullHex.slice(0, 200),
                        primeiraAnalise: r
                    });
                } else {
                    Notebook.update(packet.header, { ultimaAnalise: r });
                }
            } catch (e) { /* silencioso */ }

            return r;
        },

        async analisarSequencia(packets) {
            if (!packets.length) throw new Error('Sem pacotes capturados ainda.');
            const lista = packets.slice(0, 20).map((p, i) => {
                const nome = PacketNames.rotulo(p.header, p.dir);
                return `${i + 1}. [${p.dir}] ${nome} | ${p.byteLength}b | ${p.payloadHex.slice(0, 100) || '(vazio)'}`;
            }).join('\n');

            return this._chamar(
                this._contextoBase() +
                '\n\nTAREFA: analisar uma SEQUÊNCIA. Conte a história do fluxo entre cliente e servidor. ' +
                'Se houver padrão suspeito (repetição, reordenação, IDs fora de contexto, resposta ausente ' +
                'a um request esperado), aponte. Máximo 6 frases.',
                `Sequência de ${packets.length} pacotes:\n\n${lista}`,
                { maxTokens: 700 }
            );
        },

        async criarFiltroLinguagemNatural(descricao, amostras) {
            const amostrasTxt = amostras.length
                ? amostras.slice(0, 20).map(p =>
                    `ID ${p.header} (${PacketNames.rotulo(p.header, p.dir === 'SEND' ? 'SEND' : 'RECV')}) | ${p.byteLength}b | ASCII: "${p.ascii.slice(0, 40) || '(binário)'}"`
                  ).join('\n')
                : '(nenhuma amostra ainda)';

            const resp = await this._chamar(
                'Você converte pedidos em português em regras de filtro para um analisador de pacotes.\n' +
                'Responda SOMENTE com JSON válido, sem markdown.\n\n' +
                'Formato EXATO:\n' +
                '{"ids":[123,456],"strings":["ABC"],"motivo":"explicação curta"}\n\n' +
                '- "ids": array de inteiros. Vazio se não aplicável.\n' +
                '- "strings": array de strings hex/ascii. Vazio se não aplicável.\n' +
                '- "motivo": frase curta.\n\n' +
                'Amostras recentes:\n' + amostrasTxt,
                `Pedido: "${descricao}"`,
                { maxTokens: 400, temperature: 0.1 }
            );

            const dados = this._parseJson(resp);
            if (!dados) throw new Error('A IA respondeu em formato inválido.');
            return {
                ids: Array.isArray(dados.ids) ? dados.ids.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0) : [],
                strings: Array.isArray(dados.strings) ? dados.strings.map(s => String(s).trim()).filter(Boolean) : [],
                motivo: typeof dados.motivo === 'string' ? dados.motivo : ''
            };
        },

        async gerarJs(descricao, contexto) {
            const codigo = await this._chamar(
                this._contextoBase() +
                '\n\nTAREFA: gerar CÓDIGO JAVASCRIPT puro pra fila de ações do Sender.\n\n' +
                'AMBIENTE (novo Function com esses args):\n' +
                '  window.gameWS.send(ArrayBuffer) — envia pacote\n' +
                '  Utils.buildPacket(id, "HEX string") — monta ArrayBuffer\n' +
                '  sleep(ms) — aguarda\n' +
                '  Pode usar await.\n\n' +
                'REGRAS:\n' +
                '1. Responda SOMENTE com o código. Sem ```js, sem ```.\n' +
                '2. Máximo 15 linhas.\n' +
                '3. Use IDs conhecidos quando fizer sentido: UNIT_DANCE=2865, UNIT_WALK=2450, ' +
                'UNIT_CHAT=1678, TRADE_CONFIRM=351, FURNITURE_PLACE=2761, FURNITURE_PICKUP=1360, ' +
                'ROOM_ENTER=2031, ROOM_MODEL_SAVE=395, ROOM_RIGHTS_GIVE=1003, CATALOG_PURCHASE=3655.\n' +
                '4. Exemplo "dançar 3x com pausa 500ms":\n' +
                '   for (let i = 0; i < 3; i++) { window.gameWS.send(Utils.buildPacket(2865, "")); await sleep(500); }\n' +
                '5. Nunca inclua try/catch.',
                `Pedido: "${descricao}"\nContexto: ${contexto || 'nenhum'}`,
                { maxTokens: 500, temperature: 0.1 }
            );
            return codigo.replace(/```js|```javascript|```/g, '').trim();
        },

        async chatLivre(mensagem, contextoPacotes) {
            const totalDict = Object.keys(AppState.dicionario).length;
            let ctx = '\n\n--- Estado atual ---\n';
            if (contextoPacotes && contextoPacotes.length) {
                ctx += `Pacotes no log: ${contextoPacotes.length}\n`;
                ctx += `IDs únicos no dicionário: ${totalDict}\n\n`;
                ctx += `Últimos pacotes:\n`;
                ctx += contextoPacotes.slice(0, 12).map(p => {
                    const nome = PacketNames.rotulo(p.header, p.dir);
                    return `[${p.dir}] ${nome} | ${p.byteLength}b | ${p.payloadHex.slice(0, 80) || '(vazio)'}`;
                }).join('\n');
            } else {
                ctx += '(sem pacotes capturados no momento)\n';
            }

            return this._chamar(
                this._contextoBase() + ctx,
                mensagem,
                { maxTokens: 900 }
            );
        }
    };

    // ─── Helpers de janela ───
    function clampToViewport(targetEl, x, y) {
        const rect = targetEl.getBoundingClientRect();
        const margin = 40;
        const maxX = window.innerWidth - margin;
        const maxY = window.innerHeight - margin;
        const minX = margin - rect.width;
        const minY = 0;
        return {
            x: Math.min(Math.max(x, minX), maxX),
            y: Math.min(Math.max(y, minY), maxY)
        };
    }

    function makeDraggable(handleEl, targetEl, storageKey) {
        let isDragging = false, offX, offY;
        if (storageKey) {
            const saved = Storage.get(storageKey + '_pos', null);
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
                targetEl.style.left = saved.left + 'px';
                targetEl.style.top = saved.top + 'px';
                targetEl.style.right = 'auto';
                targetEl.style.bottom = 'auto';
                targetEl.style.transform = 'none';
            }
        }
        on(handleEl, 'mousedown', function(e) {
            if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
            isDragging = true;
            const rect = targetEl.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
        });
        on(document, 'mousemove', function(e) {
            if (!isDragging) return;
            const clamped = clampToViewport(targetEl, e.clientX - offX, e.clientY - offY);
            targetEl.style.left = clamped.x + 'px';
            targetEl.style.top = clamped.y + 'px';
            targetEl.style.right = 'auto';
            targetEl.style.bottom = 'auto';
            targetEl.style.transform = 'none';
        });
        on(document, 'mouseup', function() {
            if (!isDragging) return;
            isDragging = false;
            if (storageKey) {
                Storage.set(storageKey + '_pos', {
                    left: parseInt(targetEl.style.left, 10) || 0,
                    top: parseInt(targetEl.style.top, 10) || 0
                });
            }
        });
        handleEl.style.cursor = 'move';
    }

    function makeResizable(targetEl, { minW = 320, minH = 200, maxW = 1200, maxH = 1000, storageKey } = {}) {
        if (storageKey) {
            const saved = Storage.get(storageKey + '_size', null);
            if (saved && saved.w && saved.h) {
                targetEl.style.width = Math.min(Math.max(saved.w, minW), maxW) + 'px';
                targetEl.style.height = Math.min(Math.max(saved.h, minH), maxH) + 'px';
            }
        }
        const grip = document.createElement('div');
        Object.assign(grip.style, {
            position: 'absolute', right: '0', bottom: '0', width: '18px', height: '18px',
            cursor: 'nwse-resize', zIndex: '5',
            background: 'linear-gradient(135deg, transparent 45%, #a78bfa 45%, #a78bfa 52%, transparent 52%, transparent 62%, #a78bfa 62%, #a78bfa 69%, transparent 69%, transparent 79%, #a78bfa 79%, #a78bfa 86%, transparent 86%)',
            opacity: '0.4', transition: 'opacity 0.15s'
        });
        on(grip, 'mouseenter', () => { grip.style.opacity = '1'; });
        on(grip, 'mouseleave', () => { grip.style.opacity = '0.4'; });
        targetEl.appendChild(grip);
        let resizing = false, startX, startY, startW, startH;
        on(grip, 'mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            resizing = true; startX = e.clientX; startY = e.clientY;
            const rect = targetEl.getBoundingClientRect();
            startW = rect.width; startH = rect.height;
        });
        on(document, 'mousemove', (e) => {
            if (!resizing) return;
            const newW = Math.min(Math.max(startW + (e.clientX - startX), minW), maxW);
            const newH = Math.min(Math.max(startH + (e.clientY - startY), minH), maxH);
            targetEl.style.width = newW + 'px';
            targetEl.style.height = newH + 'px';
            targetEl.style.maxHeight = 'none';
        });
        on(document, 'mouseup', () => {
            if (!resizing) return;
            resizing = false;
            if (storageKey) {
                const rect = targetEl.getBoundingClientRect();
                Storage.set(storageKey + '_size', { w: Math.round(rect.width), h: Math.round(rect.height) });
            }
        });
    }

    function createCloseButton(onClose) {
        const btn = document.createElement('button');
        btn.textContent = '\u2715';
        btn.title = 'Fechar';
        Object.assign(btn.style, {
            background: 'transparent', color: '#8a8a9a', border: 'none',
            cursor: 'pointer', fontSize: '14px', padding: '2px 6px',
            borderRadius: '4px', transition: 'all 0.15s', marginLeft: '4px'
        });
        on(btn, 'mouseenter', () => { btn.style.background = '#ef4444'; btn.style.color = '#fff'; });
        on(btn, 'mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = '#8a8a9a'; });
        on(btn, 'click', (e) => { e.stopPropagation(); onClose(); });
        return btn;
    }

    // ─── Toolbar ───
    const Toolbar = (function() {
        const el = document.createElement('div');
        el.id = 'hl-toolbar';
        Object.assign(el.style, {
            position: 'fixed', top: '0', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px',
            background: '#0a0a0f', border: '1px solid #1a1a2e', borderTop: 'none',
            borderRadius: '0 0 8px 8px', zIndex: '100000',
            fontFamily: 'monospace', fontSize: '12px', userSelect: 'none',
            backdropFilter: 'blur(8px)'
        });
        const btnBase = {
            background: '#13131a', color: '#e1e1e6', border: '1px solid #1a1a2e',
            cursor: 'pointer', padding: '5px 12px', fontSize: '11px',
            fontFamily: 'monospace', borderRadius: '6px', transition: 'all 0.15s ease',
            whiteSpace: 'nowrap', outline: 'none'
        };
        const btnAnalyzer = document.createElement('button');
        btnAnalyzer.textContent = '\uD83D\uDD0D Analyzer';
        btnAnalyzer.title = 'Atalho: Ctrl+Alt+A';
        Object.assign(btnAnalyzer.style, btnBase);
        const btnSender = document.createElement('button');
        btnSender.textContent = '\u26A1 Sender';
        btnSender.title = 'Atalho: Ctrl+Alt+S';
        Object.assign(btnSender.style, btnBase);
        const btnEye = document.createElement('button');
        btnEye.textContent = '\uD83D\uDC41\uFE0F';
        Object.assign(btnEye.style, btnBase, { padding: '5px 10px', fontSize: '13px' });
        btnEye.title = 'Mostrar/Ocultar tudo (Ctrl+Alt+Q)';

        let analyzerVisible = false, senderVisible = false;
        function highlight(btn, on_) {
            if (on_) {
                btn.style.background = 'linear-gradient(135deg, #6c63ff, #a855f7)';
                btn.style.borderColor = 'transparent';
                btn.style.color = '#fff';
                btn.style.boxShadow = '0 0 10px rgba(108,99,255,0.35)';
            } else {
                btn.style.background = '#13131a';
                btn.style.borderColor = '#1a1a2e';
                btn.style.color = '#e1e1e6';
                btn.style.boxShadow = 'none';
            }
        }
        function updateButtons() {
            highlight(btnAnalyzer, analyzerVisible);
            highlight(btnSender, senderVisible);
        }
        function setAnalyzerVisible(show) { analyzerVisible = show; AnalyzerUI.setVisible(analyzerVisible); updateButtons(); }
        function setSenderVisible(show) { senderVisible = show; SenderUI.setVisible(senderVisible); updateButtons(); }
        function toggleAnalyzer() { setAnalyzerVisible(!analyzerVisible); }
        function toggleSender() { setSenderVisible(!senderVisible); }
        function toggleBoth() { const v = analyzerVisible || senderVisible; setAnalyzerVisible(!v); setSenderVisible(!v); }

        on(btnAnalyzer, 'click', toggleAnalyzer);
        on(btnSender, 'click', toggleSender);
        on(btnEye, 'click', toggleBoth);
        el.appendChild(btnAnalyzer); el.appendChild(btnSender); el.appendChild(btnEye);
        makeDraggable(el, el, 'toolbar');

        on(document, 'keydown', (e) => {
            if (!e.altKey || !e.ctrlKey) return;
            const tag = (e.target && e.target.tagName) || '';
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
            if (e.code === 'KeyA') { e.preventDefault(); toggleAnalyzer(); }
            else if (e.code === 'KeyS') { e.preventDefault(); toggleSender(); }
            else if (e.code === 'KeyQ') { e.preventDefault(); toggleBoth(); }
        });

        return { element: el, setAnalyzerVisible, setSenderVisible, toggleAnalyzer, toggleSender, toggleBoth };
    })();

    const SenderRef = { fill: null };

    // ═══════════════════════════════════════════════════════════════
    // ANALYZER UI (tabs: LOG | FILTROS | PESQUISA | SANG AI)
    // ═══════════════════════════════════════════════════════════════
    const AnalyzerUI = (function() {
        const el = document.createElement('div');
        el.id = 'hl-analyzer';
        Object.assign(el.style, {
            position: 'fixed', top: '50px', left: '10px',
            width: '760px', height: '680px',
            maxHeight: 'calc(100vh - 70px)',
            background: '#0f0f16', color: '#e1e1e6',
            border: '1px solid #1e1e2e', zIndex: '99998',
            fontFamily: 'monospace', fontSize: '12px',
            borderRadius: '10px', display: 'none', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.06)'
        });

        el.innerHTML = `
            <div class="drag-header" style="
                background:linear-gradient(180deg, #12121c 0%, #0a0a12 100%);
                padding:11px 14px;cursor:move;
                border-bottom:1px solid #1e1e2e;border-radius:10px 10px 0 0;
                font-weight:bold;display:flex;justify-content:space-between;align-items:center;
                font-size:12px;color:#e1e1e6;user-select:none;letter-spacing:0.05em;
            ">
                <span style="display:flex;align-items:center;gap:10px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#00d4aa;
                        box-shadow:0 0 8px #00d4aa,0 0 16px rgba(0,212,170,0.5);"></span>
                    <span style="background:linear-gradient(90deg,#e1e1e6,#8a8a9a);
                        -webkit-background-clip:text;background-clip:text;color:transparent;">
                        SANG ANALYZER
                    </span>
                </span>
                <div id="analyzerHeaderBtns" style="display:flex;gap:5px;align-items:center;">
                    <button id="btnFontMinus" title="Diminuir fonte" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">A−</button>
                    <button id="btnFontPlus" title="Aumentar fonte" style="background:#1a1a2e;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;">A+</button>
                </div>
            </div>

            <div id="analyzerTabs" style="display:flex;background:#0a0a12;border-bottom:1px solid #1e1e2e;padding:0 8px;gap:2px;">
                <button class="az-tab active" data-tab="log" style="background:transparent;color:#e1e1e6;border:none;cursor:pointer;padding:10px 16px;font-size:11px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">📋 LOG</button>
                <button class="az-tab" data-tab="filtros" style="background:transparent;color:#8a8a9a;border:none;cursor:pointer;padding:10px 16px;font-size:11px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">🛡️ FILTROS</button>
                <button class="az-tab" data-tab="pesquisa" style="background:transparent;color:#8a8a9a;border:none;cursor:pointer;padding:10px 16px;font-size:11px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">🧪 PESQUISA</button>
                <button class="az-tab" data-tab="ia" style="background:transparent;color:#8a8a9a;border:none;cursor:pointer;padding:10px 16px;font-size:11px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">✨ SANG AI</button>
            </div>

            <div id="paneLog" style="display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                <div style="padding:8px 12px;display:flex;gap:12px;align-items:center;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#00d4aa;font-weight:600;">
                        <input type="checkbox" id="chkSend" checked style="accent-color:#00d4aa;cursor:pointer;"> ENVIADOS
                    </label>
                    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#6c63ff;font-weight:600;">
                        <input type="checkbox" id="chkRecv" checked style="accent-color:#6c63ff;cursor:pointer;"> RECEBIDOS
                    </label>
                    <div style="flex:1;min-width:0;">
                        <input id="logSearch" type="text" placeholder="🔍 ID, nome do pacote, hex, texto…"
                            style="width:100%;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;
                            padding:6px 10px;font-size:11px;border-radius:6px;font-family:monospace;outline:none;box-sizing:border-box;">
                    </div>
                    <span id="logCounter" style="font-size:10px;color:#8a8a9a;white-space:nowrap;">0 logs</span>
                </div>

                <div style="padding:6px 12px;display:flex;gap:6px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <button id="btnPauseLogs" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;font-family:monospace;transition:all 0.15s;">⏸ PAUSAR</button>
                    <button id="btnCopyAll" style="flex:1;background:#13131a;color:#00d4aa;border:1px solid #1e1e2e;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;font-family:monospace;transition:all 0.15s;">📋 COPIAR</button>
                    <button id="btnClearLogs" style="flex:1;background:#13131a;color:#ef4444;border:1px solid #1e1e2e;cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;font-family:monospace;transition:all 0.15s;">🗑 LIMPAR</button>
                    <button id="btnKillSwitch" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;transition:all 0.2s;white-space:nowrap;">⚠️ DROP ALL</button>
                </div>

                <div id="logArea" style="flex:1;overflow-y:auto;padding:10px;min-height:80px;"></div>
            </div>

            <div id="paneFiltros" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;padding:14px;gap:14px;">
                <div style="display:flex;gap:14px;flex:1;min-height:0;">
                    <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#13131a;border:1px solid #1e1e2e;border-radius:8px;padding:12px;">
                        <div style="color:#6c63ff;font-weight:bold;margin-bottom:10px;font-size:11px;letter-spacing:0.05em;display:flex;align-items:center;gap:6px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:#6c63ff;"></span> OCULTAR DO LOG
                        </div>
                        <div style="font-size:10px;color:#6a6a7a;margin-bottom:8px;line-height:1.5;">Some da visualização — o pacote ainda trafega.</div>
                        <div style="display:flex;gap:4px;margin-bottom:6px;">
                            <input id="vId" type="number" placeholder="ID" style="width:70px;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddVId" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div style="display:flex;gap:4px;margin-bottom:8px;">
                            <input id="vStr" type="text" placeholder="HEX ou texto" style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;min-width:0;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddVStr" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div id="listV" style="flex:1;overflow-y:auto;margin-bottom:8px;font-size:10px;"></div>
                        <button id="btnClrV" style="width:100%;background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:5px;border-radius:5px;font-size:10px;">LIMPAR TUDO</button>
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#13131a;border:1px solid #1e1e2e;border-radius:8px;padding:12px;">
                        <div style="color:#ef4444;font-weight:bold;margin-bottom:10px;font-size:11px;letter-spacing:0.05em;display:flex;align-items:center;gap:6px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span> BLOQUEAR ENVIO
                        </div>
                        <div style="font-size:10px;color:#6a6a7a;margin-bottom:8px;line-height:1.5;">Impede o pacote de sair — o servidor nunca recebe.</div>
                        <div style="display:flex;gap:4px;margin-bottom:6px;">
                            <input id="dId" type="number" placeholder="ID" style="width:70px;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddDId" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div style="display:flex;gap:4px;margin-bottom:8px;">
                            <input id="dStr" type="text" placeholder="HEX ou texto" style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;font-size:11px;border-radius:5px;outline:none;min-width:0;box-sizing:border-box;font-family:monospace;">
                            <button id="btnAddDStr" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div id="listD" style="flex:1;overflow-y:auto;margin-bottom:8px;font-size:10px;"></div>
                        <button id="btnClrD" style="width:100%;background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:5px;border-radius:5px;font-size:10px;">LIMPAR TUDO</button>
                    </div>
                </div>

                <div style="background:linear-gradient(135deg, rgba(168,85,247,0.08), rgba(108,99,255,0.05));
                    border:1px solid rgba(168,85,247,0.25);border-radius:8px;padding:12px;">
                    <div style="color:#c4b5fd;font-weight:bold;font-size:11px;letter-spacing:0.05em;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                        ✨ FILTRO EM LINGUAGEM NATURAL
                    </div>
                    <div style="display:flex;gap:6px;">
                        <input id="nlFiltro" type="text" placeholder="Ex: esconde pacotes de movimento, oculta chats próximos…"
                            style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid rgba(168,85,247,0.3);
                            padding:8px 10px;font-size:11px;border-radius:6px;outline:none;
                            font-family:monospace;box-sizing:border-box;min-width:0;">
                        <button id="btnNlFiltro" style="background:linear-gradient(135deg,#a855f7,#6c63ff);
                            color:#fff;border:none;cursor:pointer;padding:8px 16px;border-radius:6px;
                            font-weight:bold;font-size:11px;font-family:monospace;white-space:nowrap;
                            transition:all 0.15s;">GERAR</button>
                    </div>
                    <div id="nlFiltroResultado" style="margin-top:8px;font-size:10.5px;color:#8a8a9a;line-height:1.5;"></div>
                </div>
            </div>

            <div id="panePesquisa" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                <div id="pesquisaSubtabs" style="display:flex;background:#0a0a12;border-bottom:1px solid #1e1e2e;padding:0 12px;gap:4px;">
                    <button class="pesq-tab active" data-ptab="notebook" style="background:transparent;color:#e1e1e6;border:none;cursor:pointer;padding:8px 14px;font-size:10.5px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">📓 Notebook</button>
                    <button class="pesq-tab" data-ptab="correlacao" style="background:transparent;color:#8a8a9a;border:none;cursor:pointer;padding:8px 14px;font-size:10.5px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">🔗 Correlação</button>
                    <button class="pesq-tab" data-ptab="fuzz" style="background:transparent;color:#8a8a9a;border:none;cursor:pointer;padding:8px 14px;font-size:10.5px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">💥 Fuzz</button>
                    <button class="pesq-tab" data-ptab="race" style="background:transparent;color:#8a8a9a;border:none;cursor:pointer;padding:8px 14px;font-size:10.5px;font-family:monospace;letter-spacing:0.05em;position:relative;transition:color 0.15s;outline:none;">⚡ Race</button>
                </div>

                <div id="pesqNotebook" style="display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                    <div style="padding:8px 12px;display:flex;gap:6px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                        <button id="nbExportar" style="background:#13131a;color:#00d4aa;border:1px solid #1e1e2e;cursor:pointer;padding:6px 12px;border-radius:6px;font-size:11px;font-family:monospace;">⬇ EXPORTAR</button>
                        <button id="nbImportar" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:6px 12px;border-radius:6px;font-size:11px;font-family:monospace;">⬆ IMPORTAR</button>
                        <button id="nbLimpar" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:6px;font-size:11px;font-family:monospace;">🗑 LIMPAR</button>
                        <div style="flex:1"></div>
                        <span id="nbCounter" style="font-size:10px;color:#8a8a9a;align-self:center;">0 entradas</span>
                    </div>
                    <div id="nbLista" style="flex:1;overflow-y:auto;padding:10px;"></div>
                </div>

                <div id="pesqCorrelacao" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                    <div style="padding:8px 12px;display:flex;gap:6px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                        <button id="corrAtualizar" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:6px 12px;border-radius:6px;font-size:11px;font-family:monospace;">↻ ATUALIZAR</button>
                        <button id="corrLimpar" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 12px;border-radius:6px;font-size:11px;font-family:monospace;">🗑 LIMPAR DADOS</button>
                        <div style="flex:1"></div>
                        <span id="corrCounter" style="font-size:10px;color:#8a8a9a;align-self:center;">—</span>
                    </div>
                    <div id="corrConteudo" style="flex:1;overflow-y:auto;padding:10px;"></div>
                </div>

                <div id="pesqFuzz" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                    <div style="padding:10px 12px;background:#0a0a12;border-bottom:1px solid #1e1e2e;display:flex;flex-direction:column;gap:8px;">
                        <div style="font-size:10px;color:#8a8a9a;line-height:1.5;">
                            Testa um byte por vez de um pacote OUT e observa se o servidor reage.
                            <strong style="color:#f5b942;">Sem resposta = campo ignorado (candidato a exploit)</strong>.
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <label style="font-size:10.5px;color:#8a8a9a;">ID alvo
                                <input id="fuzzId" type="number" placeholder="2865" style="width:70px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:4px;box-sizing:border-box;">
                            </label>
                            <label style="font-size:10.5px;color:#8a8a9a;">Offset
                                <input id="fuzzOffset" type="number" value="0" style="width:50px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:4px;box-sizing:border-box;">
                            </label>
                            <label style="font-size:10.5px;color:#8a8a9a;">De
                                <input id="fuzzDe" type="number" value="0" style="width:50px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:4px;box-sizing:border-box;">
                            </label>
                            <label style="font-size:10.5px;color:#8a8a9a;">Até
                                <input id="fuzzAte" type="number" value="10" style="width:50px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:4px;box-sizing:border-box;">
                            </label>
                            <label style="font-size:10.5px;color:#8a8a9a;">Delay
                                <input id="fuzzDelay" type="number" value="400" style="width:60px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:4px;box-sizing:border-box;">
                            </label>
                            <button id="fuzzIniciar" style="background:linear-gradient(135deg,#a855f7,#6c63ff);color:#fff;border:none;cursor:pointer;padding:6px 16px;border-radius:6px;font-size:11px;font-weight:bold;font-family:monospace;">▶ INICIAR</button>
                            <button id="fuzzParar" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:6px 16px;border-radius:6px;font-size:11px;font-weight:bold;font-family:monospace;display:none;">⏹ PARAR</button>
                        </div>
                    </div>
                    <div id="fuzzLog" style="flex:1;overflow-y:auto;padding:10px;font-size:11px;line-height:1.6;"></div>
                </div>

                <div id="pesqRace" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                    <div style="padding:10px 12px;background:#0a0a12;border-bottom:1px solid #1e1e2e;display:flex;flex-direction:column;gap:8px;">
                        <div style="font-size:10px;color:#8a8a9a;line-height:1.5;">
                            Envia <strong>N pacotes no mesmo tick</strong> (sem delay). Útil pra testar race conditions —
                            ex: <code style="background:#1e1e2e;padding:1px 5px;border-radius:3px;">TRADE_CONFIRM ×2</code>.
                        </div>
                        <div style="display:flex;gap:6px;">
                            <input id="raceId" type="number" placeholder="ID" style="width:70px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;border-radius:5px;font-size:11px;font-family:monospace;outline:none;box-sizing:border-box;">
                            <input id="raceHex" type="text" placeholder="Payload HEX" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;border-radius:5px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                            <input id="raceQtd" type="number" value="2" min="2" max="10" style="width:50px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:6px 8px;border-radius:5px;font-size:11px;font-family:monospace;outline:none;box-sizing:border-box;">
                            <button id="raceAdd" style="background:#13131a;color:#6c63ff;border:1px solid #6c63ff;cursor:pointer;padding:6px 12px;border-radius:5px;font-size:11px;font-weight:bold;">+</button>
                        </div>
                        <div id="raceLista" style="background:#13131a;border:1px solid #1e1e2e;border-radius:6px;padding:6px;min-height:40px;max-height:140px;overflow-y:auto;font-size:11px;"></div>
                        <div style="display:flex;gap:6px;">
                            <button id="raceEnviar" style="flex:1;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;cursor:pointer;padding:10px;border-radius:6px;font-size:12px;font-weight:bold;font-family:monospace;">⚡ ENVIAR AGORA</button>
                            <button id="raceLimpar" style="background:#13131a;color:#ef4444;border:1px solid #ef4444;cursor:pointer;padding:10px 14px;border-radius:6px;font-size:11px;font-family:monospace;">LIMPAR</button>
                        </div>
                    </div>
                    <div id="raceLog" style="flex:1;overflow-y:auto;padding:10px;font-size:11px;line-height:1.6;"></div>
                </div>
            </div>

            <div id="paneIA" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0;">
                <div id="iaChat" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:0;"></div>
                <div style="padding:8px 12px;background:#0a0a12;border-top:1px solid #1e1e2e;display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="ia-quick" data-q="seq10" style="background:#13131a;color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">Últimos 10</button>
                    <button class="ia-quick" data-q="exploit" style="background:#13131a;color:#ffb3b3;border:1px solid rgba(239,68,68,0.35);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">Candidatos a exploit</button>
                    <button class="ia-quick" data-q="anomalias" style="background:#13131a;color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">Anomalias</button>
                    <button class="ia-quick" data-q="resumo" style="background:#13131a;color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer;padding:5px 10px;border-radius:5px;font-size:10px;font-family:monospace;">Resumir tráfego</button>
                </div>
                <div style="padding:10px 12px;background:#0a0a12;border-top:1px solid #1e1e2e;display:flex;gap:6px;align-items:flex-end;">
                    <textarea id="iaInput" rows="1" placeholder="Pergunte algo ou descreva o que procura…"
                        style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;
                        padding:8px 10px;font-size:11.5px;border-radius:6px;outline:none;
                        font-family:monospace;resize:none;min-height:36px;max-height:100px;
                        box-sizing:border-box;line-height:1.4;"></textarea>
                    <button id="iaSend" style="background:linear-gradient(135deg,#a855f7,#6c63ff);
                        color:#fff;border:none;cursor:pointer;padding:8px 16px;border-radius:6px;
                        font-weight:bold;font-size:11px;font-family:monospace;white-space:nowrap;
                        transition:all 0.15s;">ENVIAR</button>
                </div>
            </div>
        `;

        makeDraggable(el.querySelector('.drag-header'), el, 'analyzer');
        makeResizable(el, { minW: 540, minH: 440, maxW: 1400, maxH: 1000, storageKey: 'analyzer' });

        const closeBtn = createCloseButton(() => Toolbar.setAnalyzerVisible(false));
        el.querySelector('#analyzerHeaderBtns').appendChild(closeBtn);

        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));

        const logArea = el.querySelector('#logArea');
        logArea.style.fontSize = AppState.fontSize + 'px';
        const logCounter = el.querySelector('#logCounter');
        const searchInp = el.querySelector('#logSearch');
        const chkSend = el.querySelector('#chkSend');
        const chkRecv = el.querySelector('#chkRecv');

        // ─── Tabs principais ───
        const tabs = el.querySelectorAll('.az-tab');
        const panes = {
            log: el.querySelector('#paneLog'),
            filtros: el.querySelector('#paneFiltros'),
            pesquisa: el.querySelector('#panePesquisa'),
            ia: el.querySelector('#paneIA')
        };
        const tabUnderlineCss = 'position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,#a855f7,#6c63ff);border-radius:2px;';
        function setActiveTab(name) {
            tabs.forEach(t => {
                const isActive = t.dataset.tab === name;
                t.style.color = isActive ? '#e1e1e6' : '#8a8a9a';
                let u = t.querySelector('.az-underline');
                if (isActive && !u) { u = document.createElement('span'); u.className = 'az-underline'; u.style.cssText = tabUnderlineCss; t.appendChild(u); }
                else if (!isActive && u) u.remove();
            });
            Object.keys(panes).forEach(k => { panes[k].style.display = (k === name) ? 'flex' : 'none'; });
            if (name === 'pesquisa' && !panes.pesquisa.dataset.iniciado) {
                panes.pesquisa.dataset.iniciado = '1';
                pesquisaInit();
            }
            if (name === 'ia' && !panes.ia.dataset.iniciado) {
                panes.ia.dataset.iniciado = '1';
                iaInit();
            }
        }
        tabs.forEach(t => on(t, 'click', () => setActiveTab(t.dataset.tab)));
        setTimeout(() => setActiveTab('log'), 0);

        // ─── Fonte ───
        on(el.querySelector('#btnFontPlus'), 'click', () => {
            AppState.fontSize = Math.min(24, AppState.fontSize + 1);
            logArea.style.fontSize = AppState.fontSize + 'px';
            Storage.set('font_size', AppState.fontSize);
        });
        on(el.querySelector('#btnFontMinus'), 'click', () => {
            AppState.fontSize = Math.max(9, AppState.fontSize - 1);
            logArea.style.fontSize = AppState.fontSize + 'px';
            Storage.set('font_size', AppState.fontSize);
        });

        // ─── Kill switch ───
        const btnKill = el.querySelector('#btnKillSwitch');
        on(btnKill, 'click', () => {
            AppState.killSwitchActive = !AppState.killSwitchActive;
            if (AppState.killSwitchActive) {
                btnKill.style.background = '#ef4444'; btnKill.style.color = '#fff';
                btnKill.textContent = '🛑 DROP ATIVO';
            } else {
                btnKill.style.background = '#13131a'; btnKill.style.color = '#ef4444';
                btnKill.textContent = '⚠️ DROP ALL';
            }
        });

        // ─── Pause ───
        const btnPause = el.querySelector('#btnPauseLogs');
        on(btnPause, 'click', () => {
            AppState.isPaused = !AppState.isPaused;
            if (AppState.isPaused) {
                btnPause.textContent = '▶ CONTINUAR';
                btnPause.style.color = '#00d4aa';
                btnPause.style.borderColor = '#00d4aa';
            } else {
                btnPause.textContent = '⏸ PAUSAR';
                btnPause.style.color = '#e1e1e6';
                btnPause.style.borderColor = '#1e1e2e';
            }
        });

        on(el.querySelector('#btnClearLogs'), 'click', () => {
            logArea.innerHTML = ''; AppState.logs = []; logCounter.textContent = '0 logs';
        });
        on(el.querySelector('#btnCopyAll'), 'click', () => {
            if (AppState.logs.length === 0) return;
            navigator.clipboard.writeText(AppState.logs.map(l => l.rawText).join('\n\n-----------------\n\n'));
        });

        function refreshVisibility() {
            const q = searchInp.value.toLowerCase();
            let v = 0;
            for (const item of AppState.logs) {
                let visible = true;
                if (item.dir === 'SEND' && !AppState.showSend) visible = false;
                if (item.dir === 'RECV' && !AppState.showRecv) visible = false;
                if (q && !item.searchString.includes(q)) visible = false;
                item.el.style.display = visible ? 'block' : 'none';
                if (visible) v++;
            }
            logCounter.textContent = v + ' de ' + AppState.logs.length;
        }
        on(chkSend, 'change', () => { AppState.showSend = chkSend.checked; refreshVisibility(); });
        on(chkRecv, 'change', () => { AppState.showRecv = chkRecv.checked; refreshVisibility(); });
        on(searchInp, 'input', refreshVisibility);

        // ─── Tags de filtro ───
        function createTag(type, act, rawVal, displayVal, cor) {
            const d = document.createElement('div');
            Object.assign(d.style, {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#0a0a12', border: '1px solid #1e1e2e',
                margin: '2px 0', padding: '3px 7px', fontSize: '10px',
                color: '#b8b8c8', borderRadius: '4px'
            });
            const span = document.createElement('span');
            span.textContent = displayVal;
            span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:85%;font-family:monospace;';
            d.appendChild(span);
            const btn = document.createElement('button');
            btn.textContent = '✕';
            btn.style.cssText = `color:${cor};background:none;border:none;cursor:pointer;font-weight:bold;padding:0 3px;`;
            on(btn, 'click', () => { PacketFilter.manageList(type, act, rawVal); renderFilters(); });
            d.appendChild(btn);
            return d;
        }
        function renderFilters() {
            const lv = el.querySelector('#listV'); lv.innerHTML = '';
            const ld = el.querySelector('#listD'); ld.innerHTML = '';
            AppState.blIds.forEach(id => lv.appendChild(createTag('VISUAL', 'REMOVE_ID', id, 'ID ' + id, '#6c63ff')));
            AppState.blPayloads.forEach(s => lv.appendChild(createTag('VISUAL', 'REMOVE_STR', s, 'HEX ' + s, '#6c63ff')));
            AppState.dropIds.forEach(id => ld.appendChild(createTag('DROP', 'REMOVE_ID', id, 'ID ' + id, '#ef4444')));
            AppState.dropPayloads.forEach(s => ld.appendChild(createTag('DROP', 'REMOVE_STR', s, 'HEX ' + s, '#ef4444')));
            if (!AppState.blIds.size && !AppState.blPayloads.length) {
                const e = document.createElement('div');
                e.style.cssText = 'color:#5a5a6a;font-size:10px;text-align:center;padding:14px;font-style:italic;';
                e.textContent = 'Nenhum filtro — tudo aparece.'; lv.appendChild(e);
            }
            if (!AppState.dropIds.size && !AppState.dropPayloads.length) {
                const e = document.createElement('div');
                e.style.cssText = 'color:#5a5a6a;font-size:10px;text-align:center;padding:14px;font-style:italic;';
                e.textContent = 'Nenhum bloqueio — todo envio passa.'; ld.appendChild(e);
            }
        }
        renderFilters();

        on(el.querySelector('#btnAddVId'), 'click', () => { PacketFilter.manageList('VISUAL', 'ADD_ID', el.querySelector('#vId').value); el.querySelector('#vId').value = ''; renderFilters(); });
        on(el.querySelector('#btnAddVStr'), 'click', () => { PacketFilter.manageList('VISUAL', 'ADD_STR', el.querySelector('#vStr').value); el.querySelector('#vStr').value = ''; renderFilters(); });
        on(el.querySelector('#btnClrV'), 'click', () => { PacketFilter.manageList('VISUAL', 'CLEAR'); renderFilters(); });
        on(el.querySelector('#btnAddDId'), 'click', () => { PacketFilter.manageList('DROP', 'ADD_ID', el.querySelector('#dId').value); el.querySelector('#dId').value = ''; renderFilters(); });
        on(el.querySelector('#btnAddDStr'), 'click', () => { PacketFilter.manageList('DROP', 'ADD_STR', el.querySelector('#dStr').value); el.querySelector('#dStr').value = ''; renderFilters(); });
        on(el.querySelector('#btnClrD'), 'click', () => { PacketFilter.manageList('DROP', 'CLEAR'); renderFilters(); });

        // ─── Filtro NL ───
        const nlInput = el.querySelector('#nlFiltro');
        const nlBtn = el.querySelector('#btnNlFiltro');
        const nlResult = el.querySelector('#nlFiltroResultado');
        async function gerarFiltroNL() {
            const desc = nlInput.value.trim();
            if (!desc) return;
            if (!SangAI.disponivel()) { nlResult.innerHTML = '<span style="color:#ef4444;">⚠ Sang AI não configurada.</span>'; return; }
            if (SangAI._busy) return;
            SangAI._busy = true;
            nlBtn.disabled = true; nlBtn.textContent = '⏳';
            nlResult.innerHTML = '<span style="color:#8a8a9a;">Consultando SangMax…</span>';
            try {
                const amostras = AppState.logs.slice(-15).map(l => l.packet);
                const r = await SangAI.criarFiltroLinguagemNatural(desc, amostras);
                if (!r.ids.length && !r.strings.length) {
                    nlResult.innerHTML = '<span style="color:#f5b942;">⚠ Não consegui extrair filtros concretos.</span>' + (r.motivo ? `<br><span style="color:#8a8a9a;">${esc(r.motivo)}</span>` : '');
                    return;
                }
                r.ids.forEach(id => PacketFilter.manageList('VISUAL', 'ADD_ID', String(id)));
                r.strings.forEach(s => PacketFilter.manageList('VISUAL', 'ADD_STR', s));
                renderFilters();
                nlResult.innerHTML =
                    `<span style="color:#00d4aa;">✓ Aplicado em OCULTAR DO LOG</span>` +
                    (r.motivo ? `<br><span style="color:#8a8a9a;">${esc(r.motivo)}</span>` : '') +
                    (r.ids.length ? `<br><span style="color:#6c63ff;">IDs: ${r.ids.join(', ')}</span>` : '') +
                    (r.strings.length ? `<br><span style="color:#6c63ff;">Strings: ${esc(r.strings.join(', '))}</span>` : '');
                nlInput.value = '';
            } catch (e) {
                nlResult.innerHTML = `<span style="color:#ef4444;">Erro: ${esc(e.message || e)}</span>`;
            } finally {
                SangAI._busy = false; nlBtn.disabled = false; nlBtn.textContent = 'GERAR';
            }
        }
        on(nlBtn, 'click', gerarFiltroNL);
        on(nlInput, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); gerarFiltroNL(); } });

        // ─── IA chat ───
        const iaChat = el.querySelector('#iaChat');
        const iaInput = el.querySelector('#iaInput');
        const iaSendBtn = el.querySelector('#iaSend');
        let iaPronto = false;

        function iaInit() {
            if (iaPronto) return;
            iaPronto = true;
            iaAdd('ia',
                'Sang AI online. Contexto carregado: **dicionário do protocolo Habbo** com ~400 IDs mapeados.\n\n' +
                'Posso:\n' +
                '• **Analisar um pacote específico** — clica no 🧠 em qualquer item do log\n' +
                '• **Analisar os últimos N pacotes** — botão "Últimos 10"\n' +
                '• **Apontar candidatos a exploit** — botão "Candidatos a exploit"\n' +
                '• **Sugerir filtros** com base no tráfego\n' +
                '• **Responder perguntas** sobre IDs, campos e padrões do protocolo\n\n' +
                'Pergunta à vontade.'
            );
            if (!SangAI.disponivel()) {
                iaAdd('erro', '⚠ Sang AI não configurada. Abra o módulo **Sang AI** e cole sua chave da Groq (console.groq.com/keys).');
            }
        }

        function iaAdd(tipo, texto) {
            const div = document.createElement('div');
            div.style.cssText = 'max-width:88%;padding:10px 14px;border-radius:12px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-wrap:break-word;animation:iaMsgIn 0.28s cubic-bezier(0.34,1.56,0.64,1);';
            if (tipo === 'user') {
                div.style.background = 'linear-gradient(135deg,#6c63ff,#a855f7)';
                div.style.color = '#fff';
                div.style.alignSelf = 'flex-end';
                div.style.borderBottomRightRadius = '4px';
            } else if (tipo === 'ia') {
                div.style.background = 'rgba(168,85,247,0.08)';
                div.style.border = '1px solid rgba(168,85,247,0.2)';
                div.style.color = '#e9d5ff';
                div.style.alignSelf = 'flex-start';
                div.style.borderBottomLeftRadius = '4px';
            } else if (tipo === 'erro') {
                div.style.background = 'rgba(239,68,68,0.08)';
                div.style.border = '1px solid rgba(239,68,68,0.25)';
                div.style.color = '#fca5a5';
                div.style.alignSelf = 'center';
                div.style.fontSize = '11px';
            } else if (tipo === 'sys') {
                div.style.background = 'rgba(255,255,255,0.03)';
                div.style.color = '#8a7aa8';
                div.style.alignSelf = 'center';
                div.style.fontSize = '10.5px';
                div.style.fontStyle = 'italic';
                div.style.padding = '6px 12px';
                div.style.borderRadius = '20px';
            }
            const html = esc(texto)
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code style="background:rgba(168,85,247,0.15);padding:1px 5px;border-radius:4px;font-size:11px;color:#e9d5ff;">$1</code>');
            div.innerHTML = html;
            iaChat.appendChild(div);
            iaChat.scrollTop = iaChat.scrollHeight;
            return div;
        }

        function iaAddLoading(texto) {
            const div = document.createElement('div');
            div.style.cssText = 'align-self:flex-start;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:12px;border-bottom-left-radius:4px;padding:11px 16px;display:flex;align-items:center;gap:8px;animation:iaMsgIn 0.28s;font-size:11px;color:#c4b5fd;';
            div.innerHTML = `<span class="ia-dot"></span><span class="ia-dot"></span><span class="ia-dot"></span><span style="margin-left:6px;">${esc(texto || 'pensando…')}</span>`;
            iaChat.appendChild(div);
            iaChat.scrollTop = iaChat.scrollHeight;
            return div;
        }

        async function iaEnviar(texto, labelLoading) {
            if (!texto.trim()) return;
            if (!SangAI.disponivel()) { iaAdd('erro', 'Sang AI não configurada.'); return; }
            if (SangAI._busy) return;
            SangAI._busy = true;
            iaAdd('user', texto);
            iaInput.value = '';
            iaInput.style.height = 'auto';
            iaSendBtn.disabled = true;
            const load = iaAddLoading(labelLoading);
            try {
                const amostras = AppState.logs.slice(-15).map(l => l.packet);
                const resp = await SangAI.chatLivre(texto, amostras);
                load.remove();
                iaAdd('ia', resp);
            } catch (e) {
                load.remove();
                iaAdd('erro', e.message || String(e));
            } finally {
                SangAI._busy = false;
                iaSendBtn.disabled = false;
                iaInput.focus();
            }
        }

        on(iaSendBtn, 'click', () => iaEnviar(iaInput.value));
        on(iaInput, 'keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); iaEnviar(iaInput.value); }
        });
        on(iaInput, 'input', () => {
            iaInput.style.height = 'auto';
            iaInput.style.height = Math.min(100, iaInput.scrollHeight) + 'px';
        });

        el.querySelectorAll('.ia-quick').forEach(btn => {
            on(btn, 'click', async () => {
                const q = btn.dataset.q;
                if (q === 'seq10') {
                    if (AppState.logs.length === 0) { iaAdd('sys', 'Nenhum pacote capturado ainda.'); return; }
                    if (SangAI._busy) return;
                    SangAI._busy = true;
                    iaAdd('user', 'Analisa os últimos 10 pacotes.');
                    iaSendBtn.disabled = true;
                    const load = iaAddLoading('analisando sequência…');
                    try {
                        const pack = AppState.logs.slice(-10).map(l => l.packet);
                        const resp = await SangAI.analisarSequencia(pack);
                        load.remove();
                        iaAdd('ia', resp);
                    } catch (e) {
                        load.remove();
                        iaAdd('erro', e.message || String(e));
                    } finally {
                        SangAI._busy = false;
                        iaSendBtn.disabled = false;
                    }
                } else if (q === 'exploit') {
                    iaEnviar(
                        'Olhando os últimos pacotes capturados, quais são candidatos a exploit? ' +
                        'Procura por: campos que o cliente controla e o servidor não valida, ' +
                        'IDs que faz sentido reenviar fora de ordem, ações em que a validação pode ' +
                        'estar no cliente em vez do servidor, sequências onde a resposta demora. ' +
                        'Lista curta com ângulo de teste concreto de cada um.'
                    );
                } else if (q === 'anomalias') {
                    iaEnviar('Olhando os últimos pacotes, tem algo anormal? Tamanho incomum, IDs raros, sequências estranhas, respostas ausentes.');
                } else if (q === 'resumo') {
                    iaEnviar('Resumo do tráfego capturado: o que o cliente e o servidor estão trocando.');
                }
            });
        });

        // ─── Botões em pacotes ───
        function createSendButton(packet) {
            const btn = document.createElement('button');
            btn.textContent = '↗'; btn.title = 'Enviar pro Sender';
            Object.assign(btn.style, {
                background: '#6c63ff', color: '#fff', border: 'none',
                cursor: 'pointer', padding: '2px 8px', marginLeft: '4px',
                fontSize: '11px', fontWeight: 'bold', borderRadius: '4px', transition: 'background 0.15s'
            });
            on(btn, 'mouseenter', () => { btn.style.background = '#7d74ff'; });
            on(btn, 'mouseleave', () => { btn.style.background = '#6c63ff'; });
            on(btn, 'click', (e) => { e.stopPropagation(); if (SenderRef.fill) SenderRef.fill(packet.header, packet.payloadHex); });
            return btn;
        }

        function createAnalyzeButton(packet, container) {
            if (!SangAI.disponivel()) return null;
            const btn = document.createElement('button');
            btn.textContent = '🧠'; btn.title = 'Explicar com Sang AI';
            Object.assign(btn.style, {
                background: 'linear-gradient(135deg,#a855f7,#6c63ff)', color: '#fff', border: 'none',
                cursor: 'pointer', padding: '2px 8px', marginLeft: '4px',
                fontSize: '11px', fontWeight: 'bold', borderRadius: '4px'
            });
            on(btn, 'click', async (e) => {
                e.stopPropagation();
                if (SangAI._busy) return;
                SangAI._busy = true;
                const original = btn.textContent;
                btn.textContent = '⏳'; btn.disabled = true;
                let info = container.querySelector('.ai-info');
                if (info) info.remove();
                info = document.createElement('div');
                info.className = 'ai-info';
                info.style.cssText = 'margin-top:8px;padding:9px 12px;background:rgba(168,85,247,0.08);border-left:3px solid #a855f7;border-radius:0 6px 6px 0;color:#c4b5fd;font-size:0.9em;line-height:1.55;font-style:italic;';
                info.textContent = 'Sang AI analisando…';
                container.appendChild(info);
                try {
                    const analise = await SangAI.analisarPacote(packet);
                    info.style.fontStyle = 'normal';
                    info.textContent = analise;
                } catch (err) {
                    info.style.background = 'rgba(239,68,68,0.08)';
                    info.style.borderLeftColor = '#ef4444';
                    info.style.color = '#fca5a5';
                    info.style.fontStyle = 'normal';
                    info.textContent = '⚠ ' + (err.message || err);
                } finally {
                    SangAI._busy = false;
                    btn.textContent = original; btn.disabled = false;
                }
            });
            return btn;
        }

        const MAX_DISPLAY_BYTES = 100;
        function makeExpandableHex(fullHex, byteLength) {
            if (byteLength <= 10000 || fullHex.length <= MAX_DISPLAY_BYTES * 3) {
                const d = document.createElement('div');
                d.style.cssText = 'word-break:break-all;color:#b0b0c0;letter-spacing:0.06em;line-height:1.5;font-size:0.95em;';
                d.textContent = fullHex; return d;
            }
            const truncated = fullHex.substring(0, MAX_DISPLAY_BYTES * 3);
            const hexDiv = document.createElement('div');
            hexDiv.style.cssText = 'word-break:break-all;color:#b0b0c0;letter-spacing:0.06em;line-height:1.5;font-size:0.95em;';
            hexDiv.textContent = truncated;
            const expandBtn = document.createElement('button');
            expandBtn.textContent = `Mostrar tudo (${byteLength} bytes)`;
            Object.assign(expandBtn.style, {
                background: '#1e1e2e', color: '#6c63ff', border: '1px solid #6c63ff',
                cursor: 'pointer', padding: '2px 8px', fontSize: '10px',
                borderRadius: '4px', fontFamily: 'monospace', marginTop: '4px'
            });
            on(expandBtn, 'click', () => { hexDiv.textContent = fullHex; expandBtn.remove(); });
            const c = document.createElement('div');
            c.appendChild(hexDiv); c.appendChild(expandBtn); return c;
        }

        function atualizarDicionario(packet) {
            const id = packet.header;
            const d = AppState.dicionario[id];
            if (!d) {
                AppState.dicionario[id] = { count: 1, primeiro: Date.now(), ultimo: Date.now(), tamanhoMedio: packet.byteLength, sample: packet.fullHex.slice(0, 200) };
            } else {
                d.count++; d.ultimo = Date.now();
                d.tamanhoMedio = Math.round((d.tamanhoMedio * (d.count - 1) + packet.byteLength) / d.count);
            }
            if (AppState.globalPacketCount % 50 === 0) Storage.set('dicionario', AppState.dicionario);
        }

        function addLog(packet, dir, isDropped) {
            AppState.globalPacketCount++;
            const id = AppState.globalPacketCount;
            const time = new Date().toLocaleTimeString();
            atualizarDicionario(packet);

            let borderColor, idColor, dirLabel;
            if (isDropped) { borderColor = '#ef4444'; idColor = '#ef4444'; dirLabel = '❌ DROP'; }
            else if (dir === 'SEND') { borderColor = '#00d4aa'; idColor = '#00d4aa'; dirLabel = '➡ SEND'; }
            else { borderColor = '#6c63ff'; idColor = '#6c63ff'; dirLabel = '⬅ RECV'; }

            const nomePktRaw = PacketNames.nome(packet.header, dir);
            const rawText = `${time} | Pacote #${id}\n${dirLabel} ID: ${packet.header}${nomePktRaw ? ' (' + nomePktRaw + ')' : ''} | ${packet.byteLength} bytes\n${packet.fullHex}\n${packet.ascii}`;

            const item = document.createElement('div');
            item.style.cssText = `border-left:3px solid ${borderColor};background:#13131a;border-radius:0 6px 6px 0;margin-bottom:8px;padding:9px 11px;animation:iaMsgIn 0.22s ease-out;`;

            const top = document.createElement('div');
            top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;';
            const left = document.createElement('div');
            left.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.85em;color:#8a8a9a;flex-wrap:wrap;';
            const numBadge = document.createElement('span');
            numBadge.textContent = '#' + id;
            numBadge.style.cssText = 'background:#1e1e2e;color:#8a8a9a;padding:1px 6px;border-radius:4px;font-size:0.9em;';
            left.appendChild(numBadge);
            const timeSpan = document.createElement('span');
            timeSpan.textContent = time;
            left.appendChild(timeSpan);
            if (isDropped) {
                const db = document.createElement('span');
                db.textContent = 'DROPPED';
                db.style.cssText = 'background:rgba(239,68,68,0.15);color:#ef4444;padding:1px 6px;border-radius:4px;font-weight:bold;font-size:0.9em;';
                left.appendChild(db);
            }
            top.appendChild(left);

            const right = document.createElement('div');
            right.style.cssText = 'display:flex;gap:4px;align-items:center;';
            if (dir === 'SEND' && !isDropped) right.appendChild(createSendButton(packet));
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋'; copyBtn.title = 'Copiar';
            Object.assign(copyBtn.style, {
                background: '#1e1e2e', color: '#8a8a9a', border: '1px solid #1e1e2e',
                cursor: 'pointer', fontSize: '11px', padding: '2px 8px',
                borderRadius: '4px', fontFamily: 'monospace', transition: 'all 0.15s'
            });
            on(copyBtn, 'mouseenter', () => { copyBtn.style.background = '#2a2a3e'; copyBtn.style.color = '#e1e1e6'; });
            on(copyBtn, 'mouseleave', () => { copyBtn.style.background = '#1e1e2e'; copyBtn.style.color = '#8a8a9a'; });
            on(copyBtn, 'click', () => { navigator.clipboard.writeText(rawText); });
            right.appendChild(copyBtn);
            top.appendChild(right);
            item.appendChild(top);

            const idWrap = document.createElement('div');
            idWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;';
            const idLine = document.createElement('div');
            idLine.style.cssText = `color:${idColor};font-weight:bold;font-size:0.95em;`;
            idLine.innerHTML = `${dirLabel} · ID ${packet.header}` +
                (nomePktRaw ? ` <span style="color:#8a8a9a;font-weight:normal;font-size:0.9em;">(${esc(nomePktRaw)})</span>` : '') +
                ` · ${packet.byteLength} bytes`;
            idWrap.appendChild(idLine);
            const analyzeBtn = createAnalyzeButton(packet, item);
            if (analyzeBtn) idWrap.appendChild(analyzeBtn);
            item.appendChild(idWrap);

            const hexWrap = document.createElement('div');
            hexWrap.style.cssText = 'margin-bottom:4px;';
            hexWrap.appendChild(makeExpandableHex(packet.fullHex, packet.byteLength));
            item.appendChild(hexWrap);

            const asciiDiv = document.createElement('div');
            asciiDiv.style.cssText = 'color:#6a6a7a;font-size:0.9em;font-style:italic;';
            asciiDiv.textContent = packet.ascii || '(binário)';
            item.appendChild(asciiDiv);

            const searchString = `${packet.header} ${nomePktRaw || ''} ${packet.fullHex} ${packet.ascii}`.toLowerCase();
            const q = searchInp.value.toLowerCase();
            let visible = true;
            if (dir === 'SEND' && !AppState.showSend) visible = false;
            if (dir === 'RECV' && !AppState.showRecv) visible = false;
            if (q && !searchString.includes(q)) visible = false;
            if (!visible) item.style.display = 'none';

            logArea.appendChild(item);
            AppState.logs.push({ el: item, dir, searchString, rawText, packet });

            while (AppState.logs.length > AppState.maxLogs) {
                const old = AppState.logs.shift();
                if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
            }
            const isBottom = logArea.scrollHeight - logArea.clientHeight <= logArea.scrollTop + 40;
            if (isBottom) logArea.scrollTop = logArea.scrollHeight;
            logCounter.textContent = AppState.logs.length + ' logs';
        }

        // ═══ Sub-tabs PESQUISA ═══
        const pesqTabs = el.querySelectorAll('.pesq-tab');
        const pesqPanes = {
            notebook: el.querySelector('#pesqNotebook'),
            correlacao: el.querySelector('#pesqCorrelacao'),
            fuzz: el.querySelector('#pesqFuzz'),
            race: el.querySelector('#pesqRace')
        };
        function setActivePesqTab(name) {
            pesqTabs.forEach(t => {
                const ativo = t.dataset.ptab === name;
                t.style.color = ativo ? '#e1e1e6' : '#8a8a9a';
                let u = t.querySelector('.az-underline');
                if (ativo && !u) { u = document.createElement('span'); u.className = 'az-underline'; u.style.cssText = tabUnderlineCss; t.appendChild(u); }
                else if (!ativo && u) u.remove();
            });
            Object.keys(pesqPanes).forEach(k => { pesqPanes[k].style.display = (k === name) ? 'flex' : 'none'; });
            if (name === 'notebook') pesquisarRender();
            if (name === 'correlacao') correlacaoRender();
        }
        pesqTabs.forEach(t => on(t, 'click', () => setActivePesqTab(t.dataset.ptab)));

        // ─── Notebook UI ───
        function pesquisarRender() {
            const lista = Notebook.listar();
            const container = el.querySelector('#nbLista');
            el.querySelector('#nbCounter').textContent = lista.length + ' entradas';
            container.innerHTML = '';
            if (!lista.length) {
                const vazio = document.createElement('div');
                vazio.style.cssText = 'color:#5a5a6a;font-size:11px;text-align:center;padding:24px;font-style:italic;';
                vazio.textContent = 'Notebook vazio. Clique no 🧠 de um pacote no log pra começar.';
                container.appendChild(vazio);
                return;
            }
            lista.forEach(entry => {
                const nome = entry.nome || PacketNames.nome(entry.id, 'SEND') || PacketNames.nome(entry.id, 'RECV') || '?';
                const div = document.createElement('div');
                div.style.cssText = 'background:#13131a;border:1px solid #1e1e2e;border-radius:8px;padding:10px 12px;margin-bottom:8px;';
                const hipoteses = (entry.hipoteses || []);
                const resultados = (entry.resultados || []);
                const notas = (entry.notas || []);
                const analise = entry.ultimaAnalise || entry.primeiraAnalise || '';
                div.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="background:#1e1e2e;color:#a855f7;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;">ID ${entry.id}</span>
                            <span style="color:#e1e1e6;font-weight:bold;font-size:11.5px;">${esc(nome)}</span>
                        </div>
                        <button class="nb-del" style="background:transparent;color:#ef4444;border:none;cursor:pointer;font-size:12px;">✕</button>
                    </div>
                    <div style="font-size:10px;color:#6a6a7a;margin-bottom:6px;">
                        ${hipoteses.length} hipóteses · ${resultados.length} resultados · ${notas.length} notas
                        · atualizado ${new Date(entry.atualizado || entry.criado).toLocaleString('pt-BR')}
                    </div>
                    ${analise ? `
                        <div style="background:rgba(168,85,247,0.06);border-left:2px solid #a855f7;padding:6px 10px;border-radius:0 4px 4px 0;font-size:10.5px;color:#c4b5fd;line-height:1.5;margin-bottom:6px;white-space:pre-wrap;">
                            ${esc(analise.slice(0, 400))}${analise.length > 400 ? '…' : ''}
                        </div>
                    ` : ''}
                    <div class="nb-hipoteses" style="font-size:10.5px;color:#8a8a9a;margin-bottom:4px;"></div>
                    <div class="nb-notas" style="font-size:10.5px;color:#8a8a9a;"></div>
                    <div style="display:flex;gap:4px;margin-top:8px;">
                        <input class="nb-input-hip" type="text" placeholder="adicionar hipótese…" style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 8px;border-radius:4px;font-size:10.5px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button class="nb-add-hip" style="background:#13131a;color:#a855f7;border:1px solid #a855f7;cursor:pointer;padding:5px 10px;border-radius:4px;font-size:10.5px;">+ hip</button>
                        <button class="nb-add-nota" style="background:#13131a;color:#00d4aa;border:1px solid #00d4aa;cursor:pointer;padding:5px 10px;border-radius:4px;font-size:10.5px;">+ nota</button>
                    </div>
                `;
                const hipEl = div.querySelector('.nb-hipoteses');
                if (hipoteses.length) {
                    hipEl.innerHTML = '<div style="color:#a855f7;font-weight:bold;margin-bottom:3px;">Hipóteses:</div>' +
                        hipoteses.map(h => `<div style="padding-left:8px;">• ${esc(h.texto)}${h.testada ? ' <span style="color:#00d4aa;">[testada]</span>' : ''}</div>`).join('');
                }
                const notaEl = div.querySelector('.nb-notas');
                if (notas.length) {
                    notaEl.innerHTML = '<div style="color:#00d4aa;font-weight:bold;margin-bottom:3px;margin-top:6px;">Notas:</div>' +
                        notas.map(n => `<div style="padding-left:8px;">• ${esc(n.texto)}</div>`).join('');
                }
                const inp = div.querySelector('.nb-input-hip');
                div.querySelector('.nb-add-hip').addEventListener('click', () => {
                    const v = inp.value.trim();
                    if (!v) return;
                    Notebook.addHipotese(entry.id, v);
                    pesquisarRender();
                });
                div.querySelector('.nb-add-nota').addEventListener('click', () => {
                    const v = inp.value.trim();
                    if (!v) return;
                    Notebook.addNota(entry.id, v);
                    pesquisarRender();
                });
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); div.querySelector('.nb-add-hip').click(); }
                });
                div.querySelector('.nb-del').addEventListener('click', () => {
                    if (confirm('Remover entrada ' + entry.id + ' do notebook?')) {
                        Notebook.remover(entry.id);
                        pesquisarRender();
                    }
                });
                container.appendChild(div);
            });
        }

        on(el.querySelector('#nbExportar'), 'click', () => {
            const json = Notebook.exportar();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sang-notebook-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        });
        on(el.querySelector('#nbImportar'), 'click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json,application/json';
            inp.onchange = (e) => {
                const f = e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                    if (Notebook.importar(r.result)) pesquisarRender();
                    else alert('Arquivo inválido.');
                };
                r.readAsText(f);
            };
            inp.click();
        });
        on(el.querySelector('#nbLimpar'), 'click', () => {
            if (!confirm('Apagar TODO o notebook? Isso não pode ser desfeito.')) return;
            Storage.set('notebook', {});
            Notebook._cache = null;
            Emitter.emit('notebook:changed');
            pesquisarRender();
        });

        // ─── Correlação UI ───
        function correlacaoRender() {
            const container = el.querySelector('#corrConteudo');
            const suspeitos = Correlator.suspeitos();
            const pares = Correlator._pares || {};
            const totalPares = Object.keys(pares).length;

            el.querySelector('#corrCounter').textContent = totalPares + ' OUTs mapeados';

            let html = '';
            html += '<div style="background:linear-gradient(135deg,rgba(239,68,68,0.08),rgba(168,85,247,0.04));border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:12px;margin-bottom:14px;">';
            html += '<div style="color:#ffb3b3;font-weight:bold;font-size:11.5px;margin-bottom:8px;letter-spacing:0.04em;">⚠ OUTS SEM RESPOSTA CONSISTENTE</div>';
            html += '<div style="font-size:10px;color:#6a6a7a;margin-bottom:8px;line-height:1.5;">Enviados com frequência mas raramente geram resposta do servidor. Candidatos fortes a exploit — o cliente age sem validação.</div>';
            if (!suspeitos.length) {
                html += '<div style="color:#5a5a6a;font-size:10.5px;font-style:italic;">Nenhum suspeito ainda. Precisa de mais tráfego.</div>';
            } else {
                html += '<div style="display:flex;flex-direction:column;gap:4px;">';
                suspeitos.slice(0, 12).forEach(s => {
                    html += `<div style="background:#0a0a12;border:1px solid #1e1e2e;border-radius:6px;padding:7px 10px;font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span style="color:#e1e1e6;font-weight:bold;">${esc(s.outNome)} <span style="color:#6a6a7a;font-weight:normal;">(ID ${s.outId})</span></span>
                        <span style="color:#ffb3b3;font-size:10px;">${s.enviados} env · ${s.respostas} resp · <strong>${s.taxa}%</strong></span>
                    </div>`;
                });
                html += '</div>';
            }
            html += '</div>';

            html += '<div style="background:#13131a;border:1px solid #1e1e2e;border-radius:8px;padding:12px;">';
            html += '<div style="color:#6c63ff;font-weight:bold;font-size:11.5px;margin-bottom:8px;letter-spacing:0.04em;">🔗 RESPOSTAS CONHECIDAS</div>';
            const outs = Object.keys(pares).map(Number).sort((a, b) => a - b);
            if (!outs.length) {
                html += '<div style="color:#5a5a6a;font-size:10.5px;font-style:italic;">Sem correlações ainda. Envie pacotes pelo Sender e observe.</div>';
            } else {
                html += '<div style="display:flex;flex-direction:column;gap:5px;">';
                outs.slice(0, 50).forEach(outId => {
                    const respostas = Correlator.respostasDe(outId);
                    const outNome = PacketNames.nome(outId, 'SEND') || '?';
                    html += `<div style="background:#0a0a12;border:1px solid #1e1e2e;border-radius:6px;padding:7px 10px;font-size:11px;">
                        <div style="color:#e1e1e6;font-weight:bold;margin-bottom:3px;">OUT.${esc(outNome)} <span style="color:#6a6a7a;font-weight:normal;">(ID ${outId})</span></div>
                        <div style="color:#8a8a9a;font-size:10px;padding-left:8px;">
                            ${respostas.slice(0, 5).map(r => `→ ${esc(r.inNome || String(r.inId))} ×${r.count}`).join('<br>')}
                        </div>
                    </div>`;
                });
                html += '</div>';
            }
            html += '</div>';
            container.innerHTML = html;
        }
        on(el.querySelector('#corrAtualizar'), 'click', correlacaoRender);
        on(el.querySelector('#corrLimpar'), 'click', () => {
            if (!confirm('Apagar todos os dados de correlação?')) return;
            Correlator.limpar();
            correlacaoRender();
        });

        // ─── Fuzz UI ───
        const fuzzLogEl = el.querySelector('#fuzzLog');
        function fuzzLog(msg, tipo) {
            const cor = tipo === 'erro' ? '#ef4444' : tipo === 'ok' ? '#00d4aa' : tipo === 'aviso' ? '#f5b942' : tipo === 'envio' ? '#8a8a9a' : '#e1e1e6';
            const div = document.createElement('div');
            div.style.cssText = `color:${cor};margin-bottom:3px;padding-left:8px;border-left:2px solid ${cor}40;`;
            div.textContent = msg;
            fuzzLogEl.appendChild(div);
            fuzzLogEl.scrollTop = fuzzLogEl.scrollHeight;
        }
        on(el.querySelector('#fuzzIniciar'), 'click', () => {
            const cfg = {
                id: Number(el.querySelector('#fuzzId').value),
                offset: Number(el.querySelector('#fuzzOffset').value),
                from: Number(el.querySelector('#fuzzDe').value),
                to: Number(el.querySelector('#fuzzAte').value),
                delay: Number(el.querySelector('#fuzzDelay').value) || 400
            };
            if (!Number.isFinite(cfg.id)) { fuzzLog('ID inválido.', 'erro'); return; }
            if (cfg.to < cfg.from) { fuzzLog('Range inválido.', 'erro'); return; }
            fuzzLogEl.innerHTML = '';
            el.querySelector('#fuzzIniciar').style.display = 'none';
            el.querySelector('#fuzzParar').style.display = 'inline-block';
            Fuzzer.iniciar(cfg);
        });
        on(el.querySelector('#fuzzParar'), 'click', () => {
            Fuzzer.parar();
            fuzzLog('Fuzz interrompido pelo usuário.', 'aviso');
            el.querySelector('#fuzzIniciar').style.display = 'inline-block';
            el.querySelector('#fuzzParar').style.display = 'none';
        });

        // ─── Race UI ───
        const raceLogEl = el.querySelector('#raceLog');
        const raceListaEl = el.querySelector('#raceLista');
        const raceFila = [];

        function raceLog(msg, cor) {
            const div = document.createElement('div');
            div.style.cssText = `color:${cor || '#e1e1e6'};margin-bottom:3px;padding-left:8px;border-left:2px solid ${(cor || '#e1e1e6')}40;`;
            div.textContent = msg;
            raceLogEl.appendChild(div);
            raceLogEl.scrollTop = raceLogEl.scrollHeight;
        }
        function raceRender() {
            raceListaEl.innerHTML = '';
            if (!raceFila.length) {
                const vazio = document.createElement('div');
                vazio.style.cssText = 'color:#5a5a6a;font-size:10.5px;text-align:center;padding:12px;font-style:italic;';
                vazio.textContent = 'Fila vazia. Adicione pacotes acima.';
                raceListaEl.appendChild(vazio);
                return;
            }
            raceFila.forEach((p, i) => {
                const linha = document.createElement('div');
                linha.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 6px;background:#0a0a12;border-radius:4px;margin-bottom:3px;';
                const nome = PacketNames.nome(p.id, 'SEND') || '?';
                const span = document.createElement('span');
                span.style.color = '#e1e1e6';
                span.textContent = `${i+1}. ${nome} (ID ${p.id})${p.hex ? ' — ' + p.hex.slice(0, 40) : ''}`;
                linha.appendChild(span);
                const rm = document.createElement('button');
                rm.textContent = '✕';
                rm.style.cssText = 'background:transparent;color:#ef4444;border:none;cursor:pointer;padding:0 4px;';
                rm.addEventListener('click', () => { raceFila.splice(i, 1); raceRender(); });
                linha.appendChild(rm);
                raceListaEl.appendChild(linha);
            });
        }
        on(el.querySelector('#raceAdd'), 'click', () => {
            const id = Number(el.querySelector('#raceId').value);
            const hex = el.querySelector('#raceHex').value || '';
            const qtd = Math.max(1, Math.min(10, Number(el.querySelector('#raceQtd').value) || 1));
            if (!Number.isFinite(id)) return;
            for (let i = 0; i < qtd; i++) raceFila.push({ id, hex });
            el.querySelector('#raceId').value = '';
            el.querySelector('#raceHex').value = '';
            raceRender();
        });
        on(el.querySelector('#raceEnviar'), 'click', async () => {
            if (!raceFila.length) { raceLog('Fila vazia.', '#ef4444'); return; }
            raceLogEl.innerHTML = '';
            raceLog(`Enviando ${raceFila.length} pacotes no mesmo tick…`, '#6c63ff');
            try {
                const r = await RaceTester.enviarSimultaneo(raceFila);
                r.enviados.forEach((p, i) => {
                    const nome = PacketNames.nome(p.id, 'SEND') || '?';
                    raceLog(`➡ ${i+1}. ${nome} (ID ${p.id})`, '#00d4aa');
                });
                const respostas = Object.entries(r.respostas);
                if (!respostas.length) {
                    raceLog('⚠ Nenhuma resposta do servidor. Suspeito — pode ter processado em lote ou ignorado.', '#f5b942');
                } else {
                    respostas.forEach(([inId, count]) => {
                        const nome = PacketNames.nome(Number(inId), 'RECV') || '?';
                        raceLog(`⬅ ${nome} (ID ${inId}) ×${count}`, '#6c63ff');
                    });
                    raceLog('✓ Teste concluído. Mais respostas que o normal pode indicar processamento duplo.', '#00d4aa');
                }
            } catch (e) {
                raceLog('Erro: ' + (e.message || e), '#ef4444');
            }
        });
        on(el.querySelector('#raceLimpar'), 'click', () => {
            raceFila.length = 0;
            raceRender();
        });
        raceRender();

        // ─── Pesquisa: init único + wiring de emissores ───
        let emissoresRegistrados = false;
        function pesquisaInit() {
            if (!emissoresRegistrados) {
                emissoresRegistrados = true;
                Emitter.on('notebook:changed', () => {
                    if (pesqPanes.notebook.style.display !== 'none') pesquisarRender();
                });
                Emitter.on('fuzzer:log', ({ msg, tipo }) => fuzzLog(msg, tipo));
                Emitter.on('fuzzer:done', () => {
                    el.querySelector('#fuzzIniciar').style.display = 'inline-block';
                    el.querySelector('#fuzzParar').style.display = 'none';
                });
            }
            setActivePesqTab('notebook');
        }

        function setVisible(show) {
            el.style.display = show ? 'flex' : 'none';
            if (show) {
                const rect = el.getBoundingClientRect();
                const c = clampToViewport(el, rect.left, rect.top);
                el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
            }
        }

        return { element: el, setVisible, addLog };
    })();

    // ═══════════════════════════════════════════════════════════════
    // SENDER UI
    // ═══════════════════════════════════════════════════════════════
    const SenderUI = (function() {
        const el = document.createElement('div');
        el.id = 'hl-sender';
        Object.assign(el.style, {
            position: 'fixed', top: '50px', right: '10px',
            width: '440px', background: '#0f0f16', color: '#e1e1e6',
            border: '1px solid #1e1e2e', zIndex: '99999',
            fontFamily: 'monospace', fontSize: '12px',
            borderRadius: '10px', display: 'none', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.06)'
        });

        el.innerHTML = `
            <div class="drag-header" style="
                background:linear-gradient(180deg, #12121c 0%, #0a0a12 100%);
                padding:11px 14px;cursor:move;
                border-bottom:1px solid #1e1e2e;border-radius:10px 10px 0 0;
                font-weight:bold;font-size:12px;color:#e1e1e6;user-select:none;
                display:flex;justify-content:space-between;align-items:center;letter-spacing:0.05em;
            ">
                <span style="display:flex;align-items:center;gap:10px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#6c63ff;
                        box-shadow:0 0 8px #6c63ff,0 0 16px rgba(108,99,255,0.5);"></span>
                    <span style="background:linear-gradient(90deg,#e1e1e6,#8a8a9a);
                        -webkit-background-clip:text;background-clip:text;color:transparent;">
                        SANG SENDER
                    </span>
                </span>
                <div id="senderHeaderBtns"></div>
            </div>
            <div id="sndBody" style="display:flex;flex-direction:column;flex:1;overflow-y:auto;min-height:0;">
                <div style="padding:10px 12px;display:flex;gap:6px;border-bottom:1px solid #1e1e2e;background:#0a0a12;">
                    <select id="selProfile" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;cursor:pointer;"></select>
                    <button id="btnNewProf" title="Novo perfil" style="background:#1e1e2e;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:7px 12px;border-radius:6px;font-size:11px;font-family:monospace;">+ NOVO</button>
                </div>
                <div style="padding:10px 12px;background:#0a0a12;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #1e1e2e;">
                    <div style="display:flex;gap:6px;">
                        <input id="sndId" type="number" placeholder="ID" style="width:70px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;box-sizing:border-box;">
                        <input id="sndHex" type="text" placeholder="Payload em HEX" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnAddSnd" style="background:#00d4aa;color:#0a0a0f;border:none;cursor:pointer;padding:7px 14px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;">ADD</button>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <input id="sndWaitMs" type="number" placeholder="Pausar (ms)" style="flex:1;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnAddWait" title="Adicionar pausa" style="background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;cursor:pointer;padding:7px 12px;border-radius:6px;font-size:11px;font-family:monospace;">+ WAIT</button>
                        <button id="btnAddJs" title="Adicionar JS manual" style="background:#13131a;color:#00d4aa;border:1px solid #00d4aa;cursor:pointer;padding:7px 12px;border-radius:6px;font-size:11px;font-family:monospace;">+ JS</button>
                    </div>
                    <div style="display:flex;gap:6px;padding-top:6px;border-top:1px dashed rgba(168,85,247,0.2);">
                        <input id="nlJs" type="text" placeholder="✨ Descreva — ex: dançar 3x com pausa 500ms"
                            style="flex:1;background:#0a0a12;color:#e1e1e6;border:1px solid rgba(168,85,247,0.3);padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnNlJs" style="background:linear-gradient(135deg,#a855f7,#6c63ff);color:#fff;border:none;cursor:pointer;padding:7px 14px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;white-space:nowrap;transition:all 0.15s;">GERAR</button>
                    </div>
                    <div id="nlJsResultado" style="font-size:10px;color:#8a8a9a;line-height:1.5;display:none;background:#0a0a12;border:1px solid #1e1e2e;border-radius:5px;padding:6px 9px;font-family:monospace;white-space:pre-wrap;"></div>
                </div>
                <div style="padding:10px 12px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <div style="font-size:10px;color:#8a8a9a;margin-bottom:6px;letter-spacing:0.05em;">FILA DE ENVIO</div>
                    <div id="sndList" style="max-height:220px;overflow-y:auto;border:1px solid #1e1e2e;padding:4px;min-height:70px;background:#13131a;border-radius:6px;"></div>
                </div>
                <div style="padding:10px 12px;background:#0a0a12;border-bottom:1px solid #1e1e2e;">
                    <div style="color:#6c63ff;font-weight:bold;text-align:center;font-size:11px;margin-bottom:6px;letter-spacing:0.04em;">📥 SIMULAR RECEBIMENTO</div>
                    <div style="display:flex;gap:6px;">
                        <input id="fakeId" type="number" placeholder="ID" style="width:70px;background:#13131a;color:#6c63ff;border:1px solid #6c63ff;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;box-sizing:border-box;">
                        <input id="fakeHex" type="text" placeholder="Payload em HEX" style="flex:1;background:#13131a;color:#6c63ff;border:1px solid #6c63ff;padding:7px 10px;border-radius:6px;font-size:11px;font-family:monospace;outline:none;min-width:0;box-sizing:border-box;">
                        <button id="btnFakeRecv" style="background:#6c63ff;color:#fff;border:none;cursor:pointer;padding:7px 12px;border-radius:6px;font-weight:bold;font-size:11px;font-family:monospace;">SIM</button>
                    </div>
                </div>
                <div style="padding:10px 12px;background:#0a0a12;display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;gap:8px;align-items:center;">
                        <label style="flex:1;font-size:11px;color:#8a8a9a;">Delay loop (ms)
                            <input id="sndDelay" type="number" style="width:70px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:6px;box-sizing:border-box;">
                        </label>
                        <label style="flex:1;font-size:11px;color:#8a8a9a;">Qtd (0 = ∞)
                            <input id="sndQtd" type="number" style="width:50px;background:#13131a;color:#e1e1e6;border:1px solid #1e1e2e;padding:5px 7px;border-radius:4px;font-size:11px;font-family:monospace;outline:none;margin-left:6px;box-sizing:border-box;">
                        </label>
                    </div>
                    <button id="btnSpamAction" style="
                        background:linear-gradient(135deg,#00d4aa,#00a88a);color:#0a0a0f;border:none;cursor:pointer;
                        padding:12px;font-weight:bold;width:100%;border-radius:8px;font-size:13px;
                        font-family:monospace;transition:all 0.15s;letter-spacing:0.05em;
                    ">🚀 INICIAR SEQUÊNCIA</button>
                </div>
            </div>
        `;

        makeDraggable(el.querySelector('.drag-header'), el, 'sender');
        makeResizable(el, { minW: 380, minH: 420, maxW: 800, maxH: 1000, storageKey: 'sender' });

        const closeBtn = createCloseButton(() => Toolbar.setSenderVisible(false));
        el.querySelector('#senderHeaderBtns').appendChild(closeBtn);

        let isSpamming = false;
        let spamRunId = 0;
        const sleep = ms => new Promise(res => setTimeout(res, ms));

        function saveCurrentProfile() {
            Storage.set('profiles', AppState.profiles);
            Storage.set('current_profile', AppState.currentProfileId);
        }

        function renderProfiles() {
            const sel = el.querySelector('#selProfile');
            sel.innerHTML = '';
            for (const pid in AppState.profiles) {
                const opt = document.createElement('option');
                opt.value = pid; opt.textContent = AppState.profiles[pid].name;
                if (pid === AppState.currentProfileId) opt.selected = true;
                sel.appendChild(opt);
            }
        }

        function renderPackets() {
            const prof = AppState.profiles[AppState.currentProfileId];
            const list = el.querySelector('#sndList');
            list.innerHTML = '';
            if (prof.packets.length === 0) {
                const e = document.createElement('div');
                e.style.cssText = 'color:#5a5a6a;font-size:11px;text-align:center;padding:16px;font-style:italic;';
                e.textContent = 'Fila vazia — adicione pacotes acima.';
                list.appendChild(e); return;
            }
            prof.packets.forEach((pkt, index) => {
                const item = document.createElement('div');
                Object.assign(item.style, {
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#0a0a12', padding: '5px 7px', marginBottom: '3px',
                    border: '1px solid #1e1e2e', borderRadius: '5px', fontSize: '11px'
                });
                const icon = document.createElement('span');
                icon.style.cssText = 'width:22px;text-align:center;flex-shrink:0;font-weight:bold;';
                const content = document.createElement('span');
                content.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                if (pkt.isDelay) {
                    icon.textContent = '⏱'; icon.style.color = '#8a8a9a';
                    content.style.color = '#8a8a9a'; content.style.fontStyle = 'italic';
                    content.textContent = `Aguardar ${pkt.ms}ms`;
                } else if (pkt.isJs) {
                    icon.textContent = '🧠'; icon.style.color = '#00d4aa';
                    content.style.color = '#00d4aa'; content.style.fontStyle = 'italic';
                    const preview = pkt.code.length > 45 ? pkt.code.substring(0, 45) + '…' : pkt.code;
                    content.textContent = `JS: ${preview}`;
                } else {
                    const nome = PacketNames.nome(pkt.id, 'SEND');
                    icon.textContent = pkt.id; icon.style.color = '#e1e1e6';
                    content.style.color = '#8a8a9a';
                    content.textContent = (nome ? nome + ' — ' : '') + (pkt.hex || '(vazio)');
                }
                item.appendChild(icon);
                item.appendChild(content);

                const btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:2px;flex-shrink:0;';
                const mkBtn = (txt, title, cor) => {
                    const b = document.createElement('button');
                    b.textContent = txt; b.title = title;
                    b.style.cssText = `background:#1e1e2e;color:${cor};border:none;cursor:pointer;padding:3px 7px;border-radius:4px;font-size:10px;`;
                    return b;
                };
                const up = mkBtn('↑', 'Mover para cima', '#e1e1e6');
                on(up, 'click', () => { if (index > 0) { [prof.packets[index - 1], prof.packets[index]] = [prof.packets[index], prof.packets[index - 1]]; saveCurrentProfile(); renderPackets(); } });
                const down = mkBtn('↓', 'Mover para baixo', '#e1e1e6');
                on(down, 'click', () => { if (index < prof.packets.length - 1) { [prof.packets[index + 1], prof.packets[index]] = [prof.packets[index], prof.packets[index + 1]]; saveCurrentProfile(); renderPackets(); } });
                const del = mkBtn('✕', 'Remover', '#ef4444');
                del.style.border = '1px solid #ef4444';
                on(del, 'click', () => { prof.packets.splice(index, 1); saveCurrentProfile(); renderPackets(); });
                btns.appendChild(up); btns.appendChild(down); btns.appendChild(del);
                item.appendChild(btns);
                list.appendChild(item);
            });
            el.querySelector('#sndDelay').value = prof.spamInterval;
            el.querySelector('#sndQtd').value = prof.spamQtd;
        }

        on(el.querySelector('#btnAddSnd'), 'click', () => {
            const idVal = el.querySelector('#sndId').value;
            const hexVal = el.querySelector('#sndHex').value || '';
            if (idVal !== '' && !isNaN(Number(idVal))) {
                AppState.profiles[AppState.currentProfileId].packets.push({ id: Number(idVal), hex: hexVal });
                el.querySelector('#sndId').value = ''; el.querySelector('#sndHex').value = '';
                saveCurrentProfile(); renderPackets();
            }
        });
        on(el.querySelector('#btnAddWait'), 'click', () => {
            const ms = parseInt(el.querySelector('#sndWaitMs').value);
            if (!isNaN(ms) && ms > 0) {
                AppState.profiles[AppState.currentProfileId].packets.push({ isDelay: true, ms });
                el.querySelector('#sndWaitMs').value = '';
                saveCurrentProfile(); renderPackets();
            }
        });
        on(el.querySelector('#btnAddJs'), 'click', () => {
            const jsCode = prompt('Código JavaScript a executar na fila:');
            if (jsCode && jsCode.trim() !== '') {
                AppState.profiles[AppState.currentProfileId].packets.push({ isJs: true, code: jsCode.trim() });
                saveCurrentProfile(); renderPackets();
            }
        });

        const nlJs = el.querySelector('#nlJs');
        const btnNlJs = el.querySelector('#btnNlJs');
        const nlJsResultado = el.querySelector('#nlJsResultado');
        async function gerarJsNL() {
            const desc = nlJs.value.trim();
            if (!desc) return;
            if (!SangAI.disponivel()) {
                nlJsResultado.style.display = 'block'; nlJsResultado.style.color = '#ef4444';
                nlJsResultado.textContent = '⚠ Sang AI não configurada.';
                return;
            }
            if (SangAI._busy) return;
            SangAI._busy = true;
            btnNlJs.disabled = true; btnNlJs.textContent = '⏳';
            nlJsResultado.style.display = 'block';
            nlJsResultado.style.color = '#8a8a9a';
            nlJsResultado.textContent = 'Sang AI gerando código…';
            try {
                const prof = AppState.profiles[AppState.currentProfileId];
                const ctx = `Perfil "${prof.name}", ${prof.packets.length} itens na fila.`;
                const codigo = await SangAI.gerarJs(desc, ctx);
                if (!codigo) throw new Error('A IA não retornou código.');
                nlJsResultado.style.color = '#c4b5fd';
                nlJsResultado.textContent = codigo;
                const confirma = confirm(`Código gerado:\n\n${codigo}\n\nAdicionar à fila?`);
                if (confirma) {
                    prof.packets.push({ isJs: true, code: codigo });
                    saveCurrentProfile(); renderPackets();
                    nlJs.value = ''; nlJsResultado.style.display = 'none';
                }
            } catch (e) {
                nlJsResultado.style.color = '#ef4444';
                nlJsResultado.textContent = '⚠ ' + (e.message || e);
            } finally {
                SangAI._busy = false; btnNlJs.disabled = false; btnNlJs.textContent = 'GERAR';
            }
        }
        on(btnNlJs, 'click', gerarJsNL);
        on(nlJs, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); gerarJsNL(); } });

        on(el.querySelector('#btnFakeRecv'), 'click', () => {
            if (!window.gameWS) return;
            const idVal = el.querySelector('#fakeId').value;
            const hexVal = el.querySelector('#fakeHex').value || '';
            if (idVal !== '' && !isNaN(Number(idVal))) {
                const buffer = Utils.buildPacket(Number(idVal), hexVal);
                window.gameWS.dispatchEvent(new MessageEvent('message', { data: buffer }));
                el.querySelector('#fakeId').value = ''; el.querySelector('#fakeHex').value = '';
            }
        });
        on(el.querySelector('#btnNewProf'), 'click', () => {
            const name = prompt('Nome do novo perfil:');
            if (name && name.trim()) {
                const id = 'prof_' + Date.now();
                AppState.profiles[id] = { name: name.trim(), packets: [], spamInterval: 300, spamQtd: 1 };
                AppState.currentProfileId = id;
                saveCurrentProfile(); renderProfiles(); renderPackets();
            }
        });
        on(el.querySelector('#selProfile'), 'change', (e) => {
            AppState.currentProfileId = e.target.value;
            saveCurrentProfile(); renderPackets();
        });
        on(el.querySelector('#sndDelay'), 'change', (e) => {
            AppState.profiles[AppState.currentProfileId].spamInterval = Number(e.target.value) || 300;
            saveCurrentProfile();
        });
        on(el.querySelector('#sndQtd'), 'change', (e) => {
            AppState.profiles[AppState.currentProfileId].spamQtd = Number(e.target.value) || 0;
            saveCurrentProfile();
        });

        on(el.querySelector('#btnSpamAction'), 'click', async function() {
            if (!window.gameWS) return;
            const btn = el.querySelector('#btnSpamAction');
            const prof = AppState.profiles[AppState.currentProfileId];
            if (isSpamming) {
                isSpamming = false; spamRunId++;
                btn.textContent = '🚀 INICIAR SEQUÊNCIA';
                btn.style.background = 'linear-gradient(135deg,#00d4aa,#00a88a)';
                btn.style.color = '#0a0a0f';
                return;
            }
            if (prof.packets.length === 0) return;
            isSpamming = true;
            const myRunId = ++spamRunId;
            btn.textContent = '⏹ PARAR SEQUÊNCIA';
            btn.style.background = 'linear-gradient(135deg,#ef4444,#b91c1c)';
            btn.style.color = '#fff';
            let loops = 0;
            const inf = (prof.spamQtd === 0);
            const sleepFn = sleep;
            const UtilsFn = Utils;
            while (isSpamming && myRunId === spamRunId && (inf || loops < prof.spamQtd)) {
                for (const item of prof.packets) {
                    if (!isSpamming || myRunId !== spamRunId) break;
                    if (item.isDelay) {
                        await sleep(item.ms);
                    } else if (item.isJs) {
                        try {
                            const fn = new Function('window', 'sleep', 'Utils', `return (async () => { ${item.code} })();`);
                            await fn(window, sleepFn, UtilsFn);
                        } catch (e) { console.error('[JS_ACTION] Erro:', e); }
                    } else {
                        if (!window.gameWS) break;
                        const buffer = Utils.buildPacket(item.id, item.hex);
                        window.gameWS.send(buffer);
                    }
                }
                loops++;
                if (isSpamming && myRunId === spamRunId && (inf || loops < prof.spamQtd)) {
                    await sleep(prof.spamInterval);
                }
            }
            if (myRunId === spamRunId) {
                isSpamming = false;
                btn.textContent = '🚀 INICIAR SEQUÊNCIA';
                btn.style.background = 'linear-gradient(135deg,#00d4aa,#00a88a)';
                btn.style.color = '#0a0a0f';
            }
        });

        function setVisible(show) {
            el.style.display = show ? 'flex' : 'none';
            if (show) {
                const rect = el.getBoundingClientRect();
                const c = clampToViewport(el, rect.left, rect.top);
                el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
            }
        }

        function fillFields(headerId, hexPayload) {
            el.querySelector('#sndId').value = headerId;
            el.querySelector('#sndHex').value = hexPayload;
            const addBtn = el.querySelector('#btnAddSnd');
            addBtn.style.background = '#fff';
            setTimeout(() => { addBtn.style.background = '#00d4aa'; }, 200);
        }

        renderProfiles();
        renderPackets();
        SenderRef.fill = fillFields;

        return { element: el, setVisible };
    })();

    // ─── Estilos globais ───
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        @keyframes iaMsgIn {
            0% { opacity: 0; transform: translateY(6px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes iaDot {
            0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
            30% { opacity: 1; transform: translateY(-4px); }
        }
        .ia-dot {
            width: 6px; height: 6px; border-radius: 50%; background: #a855f7;
            display: inline-block; animation: iaDot 1.2s ease-in-out infinite;
        }
        .ia-dot:nth-child(2) { animation-delay: 0.15s; }
        .ia-dot:nth-child(3) { animation-delay: 0.3s; }

        #hl-analyzer::-webkit-scrollbar,
        #hl-sender::-webkit-scrollbar,
        #hl-analyzer *::-webkit-scrollbar,
        #hl-sender *::-webkit-scrollbar { width: 6px; height: 6px; }

        #hl-analyzer::-webkit-scrollbar-track,
        #hl-sender::-webkit-scrollbar-track,
        #hl-analyzer *::-webkit-scrollbar-track,
        #hl-sender *::-webkit-scrollbar-track { background: #0a0a12; }

        #hl-analyzer::-webkit-scrollbar-thumb,
        #hl-sender::-webkit-scrollbar-thumb,
        #hl-analyzer *::-webkit-scrollbar-thumb,
        #hl-sender *::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 3px; }

        #hl-analyzer::-webkit-scrollbar-thumb:hover,
        #hl-sender::-webkit-scrollbar-thumb:hover,
        #hl-analyzer *::-webkit-scrollbar-thumb:hover,
        #hl-sender *::-webkit-scrollbar-thumb:hover { background: #2a2a3e; }

        #hl-analyzer input:focus,
        #hl-sender input:focus,
        #hl-analyzer textarea:focus,
        #hl-sender textarea:focus,
        #hl-analyzer select:focus,
        #hl-sender select:focus {
            border-color: #6c63ff !important;
            box-shadow: 0 0 0 2px rgba(108,99,255,0.15);
        }
        #hl-analyzer button:disabled,
        #hl-sender button:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    document.head.appendChild(styleEl);
    cleanup.push(() => { try { styleEl.remove(); } catch(e) {} });

    // Anexar
    const fragment = document.createDocumentFragment();
    fragment.appendChild(Toolbar.element);
    fragment.appendChild(AnalyzerUI.element);
    fragment.appendChild(SenderUI.element);
    document.body.appendChild(fragment);

    on(window, 'resize', () => {
        [AnalyzerUI.element, SenderUI.element].forEach((panel) => {
            if (panel.style.display === 'none') return;
            const rect = panel.getBoundingClientRect();
            const c = clampToViewport(panel, rect.left, rect.top);
            panel.style.left = c.x + 'px'; panel.style.top = c.y + 'px';
        });
    });

    // ─── WebSocket via Hub ───
    if (!window._hubSocket) {
        console.error('[Analyzer] window._hubSocket não encontrado. Carregue via Sang Hub.');
        while (cleanup.length) { const fn = cleanup.pop(); try { fn(); } catch(e) {} }
        return;
    }

    const _recentPackets = new Map();
    function fastBufferHash(buffer) {
        const u8 = new Uint8Array(buffer);
        let hash = 0;
        const len = u8.length;
        const step = len <= 256 ? 1 : Math.max(1, Math.floor(len / 64));
        for (let i = 0; i < len; i += step) {
            hash = ((hash << 5) - hash) + u8[i];
            hash |= 0;
        }
        return `${len}_${hash}`;
    }
    function isDuplicate(data) {
        if (!(data instanceof ArrayBuffer)) return false;
        const key = fastBufferHash(data);
        const now = Date.now();
        if (_recentPackets.has(key) && now - _recentPackets.get(key) < 50) return true;
        _recentPackets.set(key, now);
        if (_recentPackets.size > 200) {
            for (const [k, t] of _recentPackets) if (now - t > 200) _recentPackets.delete(k);
        }
        return false;
    }
    function handleTraffic(data, dir, isDropped) {
        if (!_alive) return;
        if (AppState.isPaused) return;
        if (dir === 'RECV' && isDuplicate(data)) return;
        const packet = Utils.parseData(data);
        if (!packet) return;

        // Alimenta o correlator com tráfego real (não droppado)
        if (!isDropped) {
            if (dir === 'SEND') Correlator.registrarEnvio(packet);
            else Correlator.registrarRecebimento(packet);
        }

        if (!PacketFilter.isVisualBlocked(packet)) {
            AnalyzerUI.addLog(packet, dir, !!isDropped);
        }
    }
    function wrapSend(ws) {
        if (!ws || ws._analyzerSendWrapped) return;
        ws._analyzerSendWrapped = true;
        const originalSend = ws.send.bind(ws);
        ws._analyzerOriginalSend = originalSend;
        ws.send = function(data) {
            if (!_alive) return originalSend(data);
            if (AppState.killSwitchActive) return;
            const packet = Utils.parseData(data);
            if (packet && PacketFilter.isNetworkDropped(packet)) {
                handleTraffic(data, 'SEND', true);
                return;
            }
            handleTraffic(data, 'SEND', false);
            return originalSend(data);
        };
    }
    async function handleInbound(event) {
        if (!_alive) return;
        let data = event.data;
        if (data instanceof Blob) {
            try { data = await data.arrayBuffer(); } catch(e) { return; }
        }
        const modifiedData = InboundTransformer.transform(data);
        handleTraffic(modifiedData, 'RECV');
    }

    window.gameWS = window._hubSocket.getActive();
    if (window.gameWS) wrapSend(window.gameWS);
    window._hubSocket.onConnect((ws) => { if (!_alive) return; window.gameWS = ws; wrapSend(ws); });
    window._hubSocket.onMessage((event, ws) => { if (!_alive) return; if (ws !== window.gameWS) return; handleInbound(event); });

    // ─── API pública ───
    function kill() {
        _alive = false;
        try { delete window[UID]; } catch(e) {}
        Fuzzer.parar();
        try { Correlator._flush(); } catch(e) {}
        Emitter.clear();
        try {
            if (window.gameWS && window.gameWS._analyzerSendWrapped) {
                if (window.gameWS._analyzerOriginalSend) window.gameWS.send = window.gameWS._analyzerOriginalSend;
                delete window.gameWS._analyzerSendWrapped;
                delete window.gameWS._analyzerOriginalSend;
            }
        } catch(e) {}
        try { Storage.set('dicionario', AppState.dicionario); } catch(e) {}
        while (cleanup.length) { const fn = cleanup.pop(); try { fn(); } catch(e) {} }
        try {
            [Toolbar.element, AnalyzerUI.element, SenderUI.element].forEach(el => {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            });
        } catch(e) {}
    }

    window[UID] = { kill };
})();
