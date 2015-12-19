//
//  NSData+Base64.h
//  MG
//
//  Created by Tim Debo on 5/20/14.
//
//

#import <Foundation/Foundation.h>

void *NewBase64Decode(
                         const char* inputBuffer,
                         size_t    length,
                         size_t    * outputLength);

char *NewBase64Encode(
                         const void* inputBuffer,
                         size_t    length,
                         bool      separateLines,
                         size_t    * outputLength);

@interface NSData (Base64)

+ (NSData*)dataFromBase64String:(NSString*)aString;
- (NSString*)base64EncodedString;

@end
