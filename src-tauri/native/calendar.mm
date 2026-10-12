#include <cstdlib>
#include <cstring>

#import <EventKit/EventKit.h>
#import <Foundation/Foundation.h>

#include <cmath>
#include <string>

namespace {

enum class Operation {
  RequestAccess,
  ListCalendars,
  SyncTasks,
};

struct AsyncContext {
  Operation operation;
  std::string input;
  std::string output;
  std::string error;
};

std::string ToStdString(NSString *value) {
  if (!value) return {};
  const char *utf8 = value.UTF8String;
  return utf8 ? std::string(utf8) : std::string();
}

NSString *ToNSString(const std::string &value) {
  return [[NSString alloc] initWithBytes:value.data()
                                  length:value.size()
                                encoding:NSUTF8StringEncoding];
}

NSString *AuthorizationStatusString() {
  const EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
  switch (status) {
    case EKAuthorizationStatusNotDetermined:
      return @"notDetermined";
    case EKAuthorizationStatusRestricted:
      return @"restricted";
    case EKAuthorizationStatusDenied:
      return @"denied";
    case EKAuthorizationStatusFullAccess:
      return @"fullAccess";
    case EKAuthorizationStatusWriteOnly:
      return @"writeOnly";
  }
  return @"unknown";
}

bool HasFullAccess() {
  // Full access is value 3 on macOS 14+, the same value used by the earlier
  // `authorized` status, so this remains compatible down to our macOS 12 target.
  return [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent] == static_cast<EKAuthorizationStatus>(3);
}

bool SerializeJSON(id object, std::string &output, std::string &error) {
  NSError *serializationError = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:&serializationError];
  if (!data) {
    error = ToStdString(serializationError.localizedDescription ?: @"Could not serialize calendar response.");
    return false;
  }
  NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  output = ToStdString(json);
  return true;
}

NSDictionary *ParseInputJSON(const std::string &input, std::string &error) {
  NSData *data = [ToNSString(input) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:&parseError];
  if (![object isKindOfClass:[NSDictionary class]]) {
    error = ToStdString(parseError.localizedDescription ?: @"Calendar sync input must be a JSON object.");
    return nil;
  }
  return object;
}

NSDate *DateForTask(NSString *dateString, NSString *timeString, bool allDay) {
  NSArray<NSString *> *dateParts = [dateString componentsSeparatedByString:@"-"];
  if (dateParts.count != 3) return nil;

  NSDateComponents *components = [[NSDateComponents alloc] init];
  components.year = dateParts[0].integerValue;
  components.month = dateParts[1].integerValue;
  components.day = dateParts[2].integerValue;
  components.timeZone = NSTimeZone.localTimeZone;

  if (!allDay && timeString.length > 0) {
    NSArray<NSString *> *timeParts = [timeString componentsSeparatedByString:@":"];
    if (timeParts.count != 2) return nil;
    components.hour = timeParts[0].integerValue;
    components.minute = timeParts[1].integerValue;
  }

  return [NSCalendar.currentCalendar dateFromComponents:components];
}

NSString *HexColor(CGColorRef color) {
  if (!color) return @"#857c6c";
  const size_t count = CGColorGetNumberOfComponents(color);
  const CGFloat *components = CGColorGetComponents(color);
  CGFloat red = 0.52;
  CGFloat green = 0.49;
  CGFloat blue = 0.42;
  if (count >= 3) {
    red = components[0];
    green = components[1];
    blue = components[2];
  } else if (count == 2) {
    red = green = blue = components[0];
  }
  return [NSString stringWithFormat:@"#%02X%02X%02X",
    (int)lround(fmax(0, fmin(1, red)) * 255),
    (int)lround(fmax(0, fmin(1, green)) * 255),
    (int)lround(fmax(0, fmin(1, blue)) * 255)];
}

void RequestAccess(AsyncContext *context) {
  EKEventStore *store = [[EKEventStore alloc] init];
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  __block BOOL granted = NO;
  __block NSString *failure = nil;

  void (^completion)(BOOL, NSError *) = ^(BOOL didGrant, NSError *requestError) {
    granted = didGrant;
    failure = requestError.localizedDescription;
    dispatch_semaphore_signal(semaphore);
  };

  if ([store respondsToSelector:@selector(requestFullAccessToEventsWithCompletion:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunguarded-availability-new"
    // Selector availability was checked above for compatibility with macOS 12.
    [store requestFullAccessToEventsWithCompletion:completion];
#pragma clang diagnostic pop
  } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    [store requestAccessToEntityType:EKEntityTypeEvent completion:completion];
#pragma clang diagnostic pop
  }

  dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
  NSMutableDictionary *result = [@{
    @"granted": @(granted),
    @"authorization": AuthorizationStatusString(),
  } mutableCopy];
  if (failure.length > 0) result[@"error"] = failure;
  SerializeJSON(result, context->output, context->error);
}

void ListCalendars(AsyncContext *context) {
  if (!HasFullAccess()) {
    context->error = "Full calendar access has not been granted.";
    return;
  }

  EKEventStore *store = [[EKEventStore alloc] init];
  NSArray<EKCalendar *> *calendars = [[store calendarsForEntityType:EKEntityTypeEvent]
    sortedArrayUsingComparator:^NSComparisonResult(EKCalendar *left, EKCalendar *right) {
      NSComparisonResult source = [left.source.title localizedCaseInsensitiveCompare:right.source.title];
      return source == NSOrderedSame ? [left.title localizedCaseInsensitiveCompare:right.title] : source;
    }];

  NSMutableArray *result = [NSMutableArray array];
  for (EKCalendar *calendar in calendars) {
    if (!calendar.allowsContentModifications) continue;
    [result addObject:@{
      @"id": calendar.calendarIdentifier ?: @"",
      @"title": calendar.title ?: @"Untitled calendar",
      @"source": calendar.source.title ?: @"On My Mac",
      @"color": HexColor(calendar.CGColor),
      @"writable": @YES,
    }];
  }
  SerializeJSON(result, context->output, context->error);
}

void SyncTasks(AsyncContext *context) {
  if (!HasFullAccess()) {
    context->error = "Full calendar access has not been granted.";
    return;
  }

  NSDictionary *input = ParseInputJSON(context->input, context->error);
  if (!input) return;

  NSString *calendarIdentifier = [input[@"calendarId"] isKindOfClass:[NSString class]] ? input[@"calendarId"] : nil;
  NSArray *tasks = [input[@"tasks"] isKindOfClass:[NSArray class]] ? input[@"tasks"] : @[];
  NSDictionary *previousMappings = [input[@"mappings"] isKindOfClass:[NSDictionary class]] ? input[@"mappings"] : @{};
  const bool includeUntimed = [input[@"includeUntimed"] boolValue];
  NSInteger durationMinutes = [input[@"durationMinutes"] integerValue];
  if (durationMinutes < 5 || durationMinutes > 720) durationMinutes = 30;

  if (calendarIdentifier.length == 0) {
    context->error = "Choose a calendar before synchronizing.";
    return;
  }

  EKEventStore *store = [[EKEventStore alloc] init];
  EKCalendar *calendar = [store calendarWithIdentifier:calendarIdentifier];
  if (!calendar || !calendar.allowsContentModifications) {
    context->error = "The selected calendar is no longer available or writable.";
    return;
  }

  NSMutableDictionary *nextMappings = [NSMutableDictionary dictionary];
  NSMutableSet<NSString *> *eligibleTaskIds = [NSMutableSet set];
  NSMutableArray<NSString *> *errors = [NSMutableArray array];
  NSInteger created = 0;
  NSInteger updated = 0;
  NSInteger deleted = 0;
  NSInteger skipped = 0;

  for (id rawTask in tasks) {
    if (![rawTask isKindOfClass:[NSDictionary class]]) continue;
    NSDictionary *task = rawTask;
    NSString *taskId = [task[@"id"] isKindOfClass:[NSString class]] ? task[@"id"] : nil;
    NSString *title = [task[@"title"] isKindOfClass:[NSString class]] ? task[@"title"] : nil;
    NSString *date = [task[@"date"] isKindOfClass:[NSString class]] ? task[@"date"] : nil;
    NSString *time = [task[@"time"] isKindOfClass:[NSString class]] ? task[@"time"] : nil;
    const bool completed = [task[@"completed"] boolValue];
    const bool allDay = time.length == 0;
    const bool eligible = taskId.length > 0 && title.length > 0 && date.length > 0 && !completed && (!allDay || includeUntimed);

    if (!eligible) {
      skipped += 1;
      continue;
    }
    [eligibleTaskIds addObject:taskId];

    NSString *mappedIdentifier = [previousMappings[taskId] isKindOfClass:[NSString class]] ? previousMappings[taskId] : nil;
    EKEvent *event = mappedIdentifier.length > 0 ? [store eventWithIdentifier:mappedIdentifier] : nil;
    const bool isNew = event == nil;
    if (isNew) event = [EKEvent eventWithEventStore:store];

    NSDate *start = DateForTask(date, time, allDay);
    if (!start) {
      [errors addObject:[NSString stringWithFormat:@"%@ has an invalid date or time.", title]];
      if (mappedIdentifier.length > 0) nextMappings[taskId] = mappedIdentifier;
      continue;
    }

    event.calendar = calendar;
    event.title = title;
    event.allDay = allDay;
    event.startDate = start;
    event.endDate = allDay
      ? [NSCalendar.currentCalendar dateByAddingUnit:NSCalendarUnitDay value:1 toDate:start options:0]
      : [NSCalendar.currentCalendar dateByAddingUnit:NSCalendarUnitMinute value:durationMinutes toDate:start options:0];
    event.timeZone = NSTimeZone.localTimeZone;

    NSString *notes = [task[@"notes"] isKindOfClass:[NSString class]] ? task[@"notes"] : @"";
    NSString *listName = [task[@"listName"] isKindOfClass:[NSString class]] ? task[@"listName"] : @"";
    NSMutableArray<NSString *> *noteParts = [NSMutableArray array];
    if (notes.length > 0) [noteParts addObject:notes];
    if (listName.length > 0) [noteParts addObject:[NSString stringWithFormat:@"ScheduGrr list: %@", listName]];
    [noteParts addObject:[NSString stringWithFormat:@"ScheduGrr task: %@", taskId]];
    event.notes = [noteParts componentsJoinedByString:@"\n\n"];

    NSError *saveError = nil;
    if (![store saveEvent:event span:EKSpanThisEvent commit:YES error:&saveError]) {
      [errors addObject:[NSString stringWithFormat:@"Could not sync %@: %@", title, saveError.localizedDescription ?: @"unknown error"]];
      if (mappedIdentifier.length > 0) nextMappings[taskId] = mappedIdentifier;
      continue;
    }

    if (event.eventIdentifier.length > 0) nextMappings[taskId] = event.eventIdentifier;
    isNew ? created += 1 : updated += 1;
  }

  for (NSString *taskId in previousMappings) {
    if ([eligibleTaskIds containsObject:taskId]) continue;
    NSString *eventIdentifier = [previousMappings[taskId] isKindOfClass:[NSString class]] ? previousMappings[taskId] : nil;
    if (eventIdentifier.length == 0) continue;
    EKEvent *event = [store eventWithIdentifier:eventIdentifier];
    if (!event || ![event.calendar.calendarIdentifier isEqualToString:calendarIdentifier]) continue;

    NSError *removeError = nil;
    if ([store removeEvent:event span:EKSpanThisEvent commit:YES error:&removeError]) {
      deleted += 1;
    } else {
      nextMappings[taskId] = eventIdentifier;
      [errors addObject:[NSString stringWithFormat:@"Could not remove %@: %@", event.title ?: taskId, removeError.localizedDescription ?: @"unknown error"]];
    }
  }

  NSDictionary *result = @{
    @"mappings": nextMappings,
    @"created": @(created),
    @"updated": @(updated),
    @"deleted": @(deleted),
    @"skipped": @(skipped),
    @"errors": errors,
  };
  SerializeJSON(result, context->output, context->error);
}

} // namespace

extern "C" char *schedugrr_calendar_call(int operation, const char *input) {
  @autoreleasepool {
    AsyncContext context;
    if (input) context.input = input;
    switch (operation) {
      case 0: return strdup(ToStdString(AuthorizationStatusString()).c_str());
      case 1: RequestAccess(&context); break;
      case 2: ListCalendars(&context); break;
      case 3: SyncTasks(&context); break;
      default: context.error = "Unknown calendar operation";
    }
    if (!context.error.empty()) SerializeJSON(@{@"error": ToNSString(context.error)}, context.output, context.error);
    return strdup(context.output.c_str());
  }
}
extern "C" void schedugrr_calendar_free(char *result) { free(result); }
