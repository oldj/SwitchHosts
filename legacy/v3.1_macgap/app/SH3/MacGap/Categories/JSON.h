//
//  JSON.h
//  MacGap
//
//  Created by Tim Debo on 5/17/14.
//  Copyright (c) 2014 Raw Creative Studios LLC. All rights reserved.
//

@interface NSArray (MGJSON)
- (NSString*)JSONString;
@end

@interface NSDictionary (MGJSON)
- (NSString*)JSONString;
@end

@interface NSString (MGJSON)
- (id)JSONObject;
@end
